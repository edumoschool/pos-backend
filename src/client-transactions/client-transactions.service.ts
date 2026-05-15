import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateClientTransactionDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class ClientTransactionsService {
  private readonly logger = new Logger(ClientTransactionsService.name);

  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
    private exchangeRates: ExchangeRatesService,
    @Optional() private telegram: TelegramService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateClientTransactionDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    const tx = await this.prisma.clientTransaction.create({
      data: { ...dto, tenantId, userId } as any,
      include: {
        client: { select: { id: true, fullName: true, phone: true } },
        user: { select: { id: true, fullName: true } },
      },
    });

    // Push Telegram notification to the client if they have a linked account
    if (this.telegram) {
      const date = this.telegram.fmtDate(tx.createdAt);
      const amount = Number(tx.amount);
      const currency = tx.currency as string;

      this.telegram
        .getClientBalance(tenantId, dto.clientId)
        .then(({ balanceUzs, balanceUsd }) => {
          if ((tx.type as string) === 'income') {
            // Payment received — client's debt went down
            return this.telegram.notifyClientPaymentReceived(dto.clientId, {
              date,
              amount,
              currency,
              balanceUzs,
              balanceUsd,
            });
          } else {
            // New debt created manually (not from a sale)
            return this.telegram.notifyClientNewDebt(dto.clientId, {
              date,
              amount,
              currency,
              description: tx.description ?? undefined,
              balanceUzs,
              balanceUsd,
            });
          }
        })
        .catch((err) => this.logger.warn('Telegram notification failed', err));
    }

    return tx;
  }

  async findAll(tenantId: string, clientId?: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = {
      tenantId,
      ...(clientId && { clientId }),
    };
    const [data, total] = await Promise.all([
      this.prisma.clientTransaction.findMany({
        where,
        include: {
          client: { select: { id: true, fullName: true, phone: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.clientTransaction.count({ where }),
    ]);
    return paginated(data, total, p, l);
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

    const { usdToUzs } = await this.exchangeRates.getLatest();

    return {
      client,
      totalAmountUzs: +balanceUzs.toFixed(2),
      totalAmountUsd: +balanceUsd.toFixed(6),
      totalAmount: +(balanceUzs + balanceUsd * usdToUzs).toFixed(2),
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
