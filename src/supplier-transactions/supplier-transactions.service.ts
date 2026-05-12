import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateSupplierTransactionDto } from './dto';

@Injectable()
export class SupplierTransactionsService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
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

  findAll(tenantId: string, supplierId?: string) {
    return this.prisma.supplierTransaction.findMany({
      where: {
        tenantId,
        ...(supplierId && { supplierId }),
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

    return {
      supplier,
      balanceUzs: +balanceUzs.toFixed(2),
      balanceUsd: +balanceUsd.toFixed(6),
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
