import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateClientDto, UpdateClientDto } from './dto';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  create(tenantId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(
    tenantId: string,
    search?: string,
    sortBy?: 'createdAt' | 'clientTransAmount' | 'alphabetic',
    order?: 'asc' | 'desc',
  ) {
    const sortField = sortBy || 'createdAt';
    const sortOrder = order || 'desc';

    const clients = await this.prisma.client.findMany({
      where: {
        tenantId,
        ...(search && {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      },
      include: {
        clientTransactions: {
          select: { amount: true, currency: true },
        },
      },
      ...(sortField === 'createdAt' && {
        orderBy: { createdAt: sortOrder },
      }),
      ...(sortField === 'alphabetic' && {
        orderBy: { fullName: sortOrder },
      }),
    });

    const result = clients.map(({ clientTransactions, ...client }) => {
      let totalAmountUzs = 0;
      let totalAmountUsd = 0;

      for (const tx of clientTransactions) {
        if (tx.currency === 'UZS') totalAmountUzs += Number(tx.amount);
        else totalAmountUsd += Number(tx.amount);
      }

      return {
        ...client,
        totalAmountUzs: +totalAmountUzs.toFixed(2),
        totalAmountUsd: +totalAmountUsd.toFixed(6),
      };
    });

    if (sortField === 'clientTransAmount') {
      result.sort((a, b) => {
        const totalA = a.totalAmountUzs + a.totalAmountUsd;
        const totalB = b.totalAmountUzs + b.totalAmountUsd;
        return sortOrder === 'asc' ? totalA - totalB : totalB - totalA;
      });
    }

    return result;
  }

  async findOne(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId },
      include: {
        clientTransactions: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!client) throw new NotFoundException('Client not found');

    const allTransactions = await this.prisma.clientTransaction.findMany({
      where: { tenantId, clientId: id },
      select: { amount: true, currency: true },
    });

    let totalAmountUzs = 0;
    let totalAmountUsd = 0;

    for (const tx of allTransactions) {
      if (tx.currency === 'UZS') totalAmountUzs += Number(tx.amount);
      else totalAmountUsd += Number(tx.amount);
    }

    return {
      ...client,
      totalAmountUzs: +totalAmountUzs.toFixed(2),
      totalAmountUsd: +totalAmountUsd.toFixed(6),
    };
  }

  async update(tenantId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(tenantId, id);
    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.client.delete({ where: { id } });
  }

  async exportExcel(tenantId: string) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId },
      include: {
        clientTransactions: { select: { amount: true, currency: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Name', 'Phone', 'Address', 'Notes', 'Total UZS', 'Total USD', 'Created At'];
    const rows = clients.map(({ clientTransactions, ...client }) => {
      let totalUzs = 0;
      let totalUsd = 0;
      for (const tx of clientTransactions) {
        if (tx.currency === 'UZS') totalUzs += Number(tx.amount);
        else totalUsd += Number(tx.amount);
      }
      return [
        client.fullName,
        client.phone ?? '',
        client.address ?? '',
        client.notes ?? '',
        totalUzs.toFixed(2),
        totalUsd.toFixed(6),
        client.createdAt.toISOString().slice(0, 10),
      ];
    });

    const tsvContent = [
      headers.join('\t'),
      ...rows.map((row) => row.map((v) => String(v)).join('\t')),
    ].join('\n');

    const buffer = Buffer.from(tsvContent, 'utf-8');
    const fileName = `clients-${Date.now()}.xls`;
    const objectKey = await this.minioService.uploadReport(buffer, fileName, 'application/vnd.ms-excel');
    const url = await this.minioService.getFileUrl(objectKey);

    return { url, fileName };
  }
}
