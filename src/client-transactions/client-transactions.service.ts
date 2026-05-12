import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateClientTransactionDto } from './dto';

@Injectable()
export class ClientTransactionsService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateClientTransactionDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    return this.prisma.clientTransaction.create({
      data: { ...dto, tenantId, userId } as any,
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
  }

  findAll(tenantId: string, clientId?: string) {
    return this.prisma.clientTransaction.findMany({
      where: {
        tenantId,
        ...(clientId && { clientId }),
      },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const tx = await this.prisma.clientTransaction.findFirst({
      where: { id, tenantId },
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!tx) throw new NotFoundException('Client transaction not found');
    return tx;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.clientTransaction.delete({ where: { id } });
  }

  /**
   * Balance summary per client: total income vs total outcome (debt).
   */
  async clientBalance(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    const transactions = await this.prisma.clientTransaction.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'asc' },
    });

    let balanceUzs = 0;
    let balanceUsd = 0;

    for (const tx of transactions) {
      const sign = tx.type === 'income' ? 1 : -1;
      if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
      else balanceUsd += sign * Number(tx.amount);
    }

    return {
      client,
      balanceUzs: +balanceUzs.toFixed(2),
      balanceUsd: +balanceUsd.toFixed(6),
      transactions,
    };
  }

  async exportExcel(tenantId: string, clientId?: string) {
    const transactions = await this.prisma.clientTransaction.findMany({
      where: {
        tenantId,
        ...(clientId && { clientId }),
      },
      include: {
        client: { select: { fullName: true, phone: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Date', 'Client', 'Phone', 'Type', 'Amount', 'Currency', 'Payment Method', 'Due Date', 'Description', 'Created By'];
    const rows = transactions.map((tx) => [
      tx.createdAt.toISOString().slice(0, 10),
      tx.client.fullName,
      tx.client.phone ?? '',
      tx.type,
      Number(tx.amount),
      tx.currency,
      tx.paymentMethod ?? '',
      tx.dueDate ? tx.dueDate.toISOString().slice(0, 10) : '',
      tx.description ?? '',
      tx.user.fullName,
    ]);

    const tsvContent = [
      headers.join('\t'),
      ...rows.map((row) => row.map((v) => String(v)).join('\t')),
    ].join('\n');

    const buffer = Buffer.from(tsvContent, 'utf-8');
    const fileName = `client-transactions-${Date.now()}.xls`;
    const objectKey = await this.minioService.uploadReport(buffer, fileName, 'application/vnd.ms-excel');
    const url = await this.minioService.getFileUrl(objectKey);

    return { url, fileName };
  }
}
