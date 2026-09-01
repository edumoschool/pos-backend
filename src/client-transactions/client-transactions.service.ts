import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { TelegramService } from '../telegram/telegram.service';
import { Prisma } from '../generated/prisma/client';
import {
  I18nBadRequestException,
  I18nNotFoundException,
} from '../i18n/i18n.exception';
import { CreateClientTransactionDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

const TX_INCLUDE = {
  client: { select: { id: true, fullName: true, phone: true } },
  user: { select: { id: true, fullName: true } },
  sale: {
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      currency: true,
      totalAmount: true,
      discount: true,
      paidAmount: true,
      debtAmount: true,
      note: true,
      createdAt: true,
      branch: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  },
} as const;

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
    if (!client) throw new I18nNotFoundException('errors.client.notFound');

    const tx = dto.saleId
      ? await this.createSalePayment(tenantId, userId, client.id, dto)
      : await this.prisma.clientTransaction.create({
          data: { ...dto, tenantId, userId } as any,
          include: TX_INCLUDE,
        });

    this.notifyTelegram(tenantId, dto, tx).catch((err) =>
      this.logger.warn('Telegram notification failed', err),
    );

    return tx;
  }

  /**
   * Pay down (fully or partially) a specific debt sale. Keeps `Sale.paidAmount`
   * / `debtAmount` / `status` in sync with the client-transaction ledger —
   * without this, a sale's own debt fields never move again after creation,
   * even once the client has actually paid it off.
   */
  private async createSalePayment(
    tenantId: string,
    userId: string,
    clientId: string,
    dto: CreateClientTransactionDto,
  ) {
    if (dto.type !== 'income') {
      throw new I18nBadRequestException('errors.clientTransaction.saleLinkRequiresIncome');
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: dto.saleId, tenantId } });
      if (!sale) throw new I18nNotFoundException('errors.sale.notFound');
      if (sale.clientId !== clientId) {
        throw new I18nBadRequestException('errors.clientTransaction.saleClientMismatch');
      }
      if (sale.status === 'cancelled') {
        throw new I18nBadRequestException('errors.sale.alreadyCancelled');
      }

      const currency = dto.currency ?? sale.currency;
      if (currency !== sale.currency) {
        throw new I18nBadRequestException('errors.clientTransaction.currencyMismatch', {
          expected: sale.currency,
          received: currency,
        });
      }

      const amount = new Prisma.Decimal(dto.amount);
      const remaining = new Prisma.Decimal(sale.debtAmount);

      if (amount.lessThanOrEqualTo(0)) {
        throw new I18nBadRequestException('errors.clientTransaction.amountMustBePositive');
      }
      if (amount.greaterThan(remaining)) {
        throw new I18nBadRequestException('errors.clientTransaction.exceedsDebt', {
          amount: String(amount),
          remaining: String(remaining),
        });
      }

      const created = await tx.clientTransaction.create({
        data: {
          tenantId,
          clientId,
          userId,
          saleId: sale.id,
          type: 'income',
          amount,
          currency,
          paymentMethod: dto.paymentMethod ?? null,
          description: dto.description ?? `Payment for sale #${sale.id}`,
        },
        include: TX_INCLUDE,
      });

      const paidAmount = new Prisma.Decimal(sale.paidAmount).plus(amount);
      const debtAmount = Prisma.Decimal.max(0, remaining.minus(amount));

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount,
          debtAmount,
          status: debtAmount.isZero() ? 'completed' : 'debt',
        },
      });

      return created;
    });
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
        include: TX_INCLUDE,
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
      include: TX_INCLUDE,
    });
    if (!tx) throw new NotFoundException('Client transaction not found');
    return tx;
  }

  async remove(tenantId: string, id: string) {
    const record = await this.prisma.clientTransaction.findFirst({
      where: { id, tenantId },
    });
    if (!record) throw new I18nNotFoundException('errors.common.notFound');

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.clientTransaction.delete({ where: { id } });

      // Reverse the effect on the linked sale, mirroring create()'s sync so
      // the sale's debt fields don't drift when a payment is undone.
      if (deleted.saleId && deleted.type === 'income') {
        const sale = await tx.sale.findUnique({ where: { id: deleted.saleId } });
        if (sale && sale.status !== 'cancelled') {
          const amount = new Prisma.Decimal(deleted.amount);
          const paidAmount = Prisma.Decimal.max(0, new Prisma.Decimal(sale.paidAmount).minus(amount));
          const debtAmount = Prisma.Decimal.min(
            sale.totalAmount,
            new Prisma.Decimal(sale.debtAmount).plus(amount),
          );

          await tx.sale.update({
            where: { id: sale.id },
            data: {
              paidAmount,
              debtAmount,
              status: debtAmount.greaterThan(0) ? 'debt' : 'completed',
            },
          });
        }
      }

      return deleted;
    });
  }

  /**
   * Balance summary per client: total income vs total outcome (debt).
   */
  async clientBalance(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) throw new I18nNotFoundException('errors.client.notFound');

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

  private async notifyTelegram(
    tenantId: string,
    dto: CreateClientTransactionDto,
    tx: { createdAt: Date; amount: Prisma.Decimal | number; currency: string; description: string | null },
  ) {
    if (!this.telegram) return;

    const date = this.telegram.fmtDate(tx.createdAt);
    const amount = Number(tx.amount);
    const currency = tx.currency;

    const { balanceUzs, balanceUsd } = await this.telegram.getClientBalance(tenantId, dto.clientId);

    if (dto.type === 'income') {
      // Payment received — client's debt went down (whether or not it was
      // linked to a specific sale).
      await this.telegram.notifyClientPaymentReceived(dto.clientId, {
        date,
        amount,
        currency,
        balanceUzs,
        balanceUsd,
      });
    } else {
      // New debt created manually (not from a sale)
      await this.telegram.notifyClientNewDebt(dto.clientId, {
        date,
        amount,
        currency,
        description: tx.description ?? undefined,
        balanceUzs,
        balanceUsd,
      });
    }
  }
}
