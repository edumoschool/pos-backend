import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
    private exchangeRates: ExchangeRatesService,
  ) {}

  create(tenantId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, search?: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = {
      tenantId,
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const { usdToUzs } = await this.exchangeRates.getLatest();
    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: {
          supplierTransactions: {
            select: { amount: true, currency: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    const data = suppliers.map(({ supplierTransactions, ...supplier }) => {
      let balanceUzs = 0;
      let balanceUsd = 0;
      for (const tx of supplierTransactions) {
        const sign = tx.type === 'income' ? 1 : -1;
        if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
        else balanceUsd += sign * Number(tx.amount);
      }
      return {
        ...supplier,
        totalAmountUzs: +balanceUzs.toFixed(2),
        totalAmountUsd: +balanceUsd.toFixed(6),
        totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
      };
    });

    return paginated(data, total, p, l);
  }

  async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: {
        supplierTransactions: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const allTransactions = await this.prisma.supplierTransaction.findMany({
      where: { tenantId, supplierId: id },
      select: { amount: true, currency: true, type: true },
    });

    let balanceUzs = 0;
    let balanceUsd = 0;

    for (const tx of allTransactions) {
      const sign = tx.type === 'income' ? 1 : -1;
      if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
      else balanceUsd += sign * Number(tx.amount);
    }

    const { usdToUzs } = await this.exchangeRates.getLatest();

    return {
      ...supplier,
      totalAmountUzs: +balanceUzs.toFixed(2),
      totalAmountUsd: +balanceUsd.toFixed(6),
      totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
    };
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, id);
    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    const supplier = await this.findOne(tenantId, id);
    if (supplier.totalAmountUzs < 0 || supplier.totalAmountUsd < 0) {
      throw new BadRequestException('Cannot delete supplier with outstanding debt');
    }

    return this.prisma.supplier.delete({ where: { id } });
  }

  async exportExcel(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, isActive: true },
      include: {
        supplierTransactions: { select: { amount: true, currency: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Name', 'Phone', 'Address', 'Notes', 'Total UZS', 'Total USD', 'Active', 'Created At'];
    const rows = suppliers.map(({ supplierTransactions, ...supplier }) => {
      let totalUzs = 0;
      let totalUsd = 0;
      for (const tx of supplierTransactions) {
        if (tx.currency === 'UZS') totalUzs += Number(tx.amount);
        else totalUsd += Number(tx.amount);
      }
      return [
        supplier.name,
        supplier.phone ?? '',
        supplier.address ?? '',
        supplier.notes ?? '',
        totalUzs.toFixed(2),
        totalUsd.toFixed(6),
        supplier.isActive ? 'Yes' : 'No',
        supplier.createdAt.toISOString().slice(0, 10),
      ];
    });

    const tsvContent = [
      headers.join('\t'),
      ...rows.map((row) => row.map((v) => String(v)).join('\t')),
    ].join('\n');

    const buffer = Buffer.from(tsvContent, 'utf-8');
    const fileName = `suppliers-${Date.now()}.xls`;
    const objectKey = await this.minioService.uploadReport(buffer, fileName, 'application/vnd.ms-excel');
    const url = await this.minioService.getFileUrl(objectKey);

    return { url, fileName };
  }
}
