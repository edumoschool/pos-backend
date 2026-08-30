import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
    private exchangeRates: ExchangeRatesService,
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
    page = 1,
    limit = 20,
  ) {
    const sortField = sortBy || 'createdAt';
    const sortOrder = order || 'desc';
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);

    const where = {
      tenantId,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const { usdToUzs } = await this.exchangeRates.getLatest();

    if (sortField === 'clientTransAmount') {
      const clients = await this.prisma.client.findMany({
        where,
        include: {
          clientTransactions: {
            select: { amount: true, currency: true, type: true },
          },
        },
      });

      const result = clients.map(({ clientTransactions, ...client }) => {
        let balanceUzs = 0;
        let balanceUsd = 0;
        for (const tx of clientTransactions) {
          const sign = tx.type === 'income' ? 1 : -1;
          if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
          else balanceUsd += sign * Number(tx.amount);
        }
        return {
          ...client,
          totalAmountUzs: +balanceUzs.toFixed(2),
          totalAmountUsd: +balanceUsd.toFixed(6),
          totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
        };
      });

      result.sort((a, b) => {
        const totalA = a.totalAmount;
        const totalB = b.totalAmount;
        return sortOrder === 'asc' ? totalA - totalB : totalB - totalA;
      });

      const total = result.length;
      const data = result.slice(skip, skip + take);
      return paginated(data, total, p, l);
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        include: {
          clientTransactions: {
            select: { amount: true, currency: true, type: true },
          },
        },
        ...(sortField === 'createdAt' && {
          orderBy: { createdAt: sortOrder },
        }),
        ...(sortField === 'alphabetic' && {
          orderBy: { fullName: sortOrder },
        }),
        skip,
        take,
      }),
      this.prisma.client.count({ where }),
    ]);

    const data = clients.map(({ clientTransactions, ...client }) => {
      let balanceUzs = 0;
      let balanceUsd = 0;
      for (const tx of clientTransactions) {
        const sign = tx.type === 'income' ? 1 : -1;
        if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
        else balanceUsd += sign * Number(tx.amount);
      }
        return {
          ...client,
          totalAmountUzs: +balanceUzs.toFixed(2),
          totalAmountUsd: +balanceUsd.toFixed(6),
          totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
        };
    });

    return paginated(data, total, p, l);
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
      ...client,
      totalAmountUzs: +balanceUzs.toFixed(2),
      totalAmountUsd: +balanceUsd.toFixed(6),
      totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
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
    const client = await this.findOne(tenantId, id);
    if (client.totalAmountUzs < 0 || client.totalAmountUsd < 0) {
      throw new BadRequestException('Cannot delete client with outstanding debt');
    }

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
    console.log('object:', objectKey)
    const url = await this.minioService.getFileUrl(objectKey);
    console.log('url:', url)
    return { url, fileName };
  }
}
