import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  create(tenantId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: { ...dto, tenantId },
    });
  }

  findAll(tenantId: string, search?: string) {
    return this.prisma.supplier.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, id);
    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
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
