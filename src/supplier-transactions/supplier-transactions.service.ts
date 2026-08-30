import { Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateSupplierTransactionDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class SupplierTransactionsService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
    private exchangeRates: ExchangeRatesService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateSupplierTransactionDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.prisma.supplierTransaction.create({
      data: { ...dto, tenantId, userId } as any,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
  }

  async findAll(tenantId: string, supplierId?: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = {
      tenantId,
      ...(supplierId && { supplierId }),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplierTransaction.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.supplierTransaction.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(tenantId: string, id: string) {
    const tx = await this.prisma.supplierTransaction.findFirst({
      where: { id, tenantId },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!tx) throw new NotFoundException('Supplier transaction not found');
    return tx;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.supplierTransaction.delete({ where: { id } });
  }

  /**
   * Balance summary per supplier: total income vs total outcome (debt owed to supplier).
   */
  async supplierBalance(tenantId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const transactions = await this.prisma.supplierTransaction.findMany({
      where: { tenantId, supplierId },
      orderBy: { createdAt: 'asc' },
    });

    let balanceUzs = 0;
    let balanceUsd = 0;

    for (const tx of transactions) {
      // outcome = we owe supplier (negative balance towards us)
      const sign = tx.type === 'income' ? 1 : -1;
      if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
      else balanceUsd += sign * Number(tx.amount);
    }

    const { usdToUzs } = await this.exchangeRates.getLatest();

    return {
      supplier,
      totalAmountUzs: +balanceUzs.toFixed(2),
      totalAmountUsd: +balanceUsd.toFixed(6),
      totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
      transactions,
    };
  }

  async exportExcel(tenantId: string, supplierId?: string) {
    const transactions = await this.prisma.supplierTransaction.findMany({
      where: {
        tenantId,
        ...(supplierId && { supplierId }),
      },
      include: {
        supplier: { select: { name: true, phone: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Date', 'Supplier', 'Phone', 'Type', 'Amount', 'Currency', 'Payment Method', 'Description', 'Created By'];
    const rows = transactions.map((tx) => [
      tx.createdAt.toISOString().slice(0, 10),
      tx.supplier.name,
      tx.supplier.phone ?? '',
      tx.type,
      Number(tx.amount),
      tx.currency,
      tx.paymentMethod ?? '',
      tx.description ?? '',
      tx.user.fullName,
    ]);

    const tsvContent = [
      headers.join('\t'),
      ...rows.map((row) => row.map((v) => String(v)).join('\t')),
    ].join('\n');

    const buffer = Buffer.from(tsvContent, 'utf-8');
    const fileName = `supplier-transactions-${Date.now()}.xls`;
    const objectKey = await this.minioService.uploadReport(buffer, fileName, 'application/vnd.ms-excel');
    const url = await this.minioService.getFileUrl(objectKey);

    return { url, fileName };
  }
}
