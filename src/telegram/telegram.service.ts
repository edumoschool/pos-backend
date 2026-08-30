import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { Lang } from './telegram.i18n';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly prisma: PrismaService,
  ) {}

  // ─── TelegramUser helpers ─────────────────────────────────────────

  async findOrCreate(chatId: string) {
    return this.prisma.telegramUser.upsert({
      where: { chatId },
      update: {},
      create: { chatId },
    });
  }

  async getUser(chatId: string) {
    return this.prisma.telegramUser.findUnique({
      where: { chatId },
      include: { client: true },
    });
  }

  async setState(chatId: string, state: string, stateData?: any) {
    await this.prisma.telegramUser.update({
      where: { chatId },
      data: { state, stateData: stateData ?? null },
    });
  }

  async getLanguage(chatId: string): Promise<Lang> {
    const u = await this.prisma.telegramUser.findUnique({ where: { chatId }, select: { language: true } });
    return (u?.language as Lang) ?? 'en';
  }

  async setLanguage(chatId: string, lang: Lang) {
    await this.prisma.telegramUser.update({ where: { chatId }, data: { language: lang as any } });
  }

  async isLinked(chatId: string): Promise<boolean> {
    const u = await this.prisma.telegramUser.findUnique({ where: { chatId }, select: { clientId: true } });
    return !!u?.clientId;
  }

  /** Unlink a Telegram account from a client */
  async unlink(chatId: string) {
    await this.prisma.telegramUser.update({
      where: { chatId },
      data: { clientId: null, tenantId: null, phone: null, state: 'idle', stateData: null },
    });
  }

  // ─── Client linking via phone ──────────────────────────────────────

  /**
   * Find a Client by phone number (searching across all tenants),
   * then link this chatId to that client.
   */
  async linkClientByPhone(chatId: string, rawPhone: string) {
    const digits = rawPhone.replace(/[^0-9]/g, '');
    const variants = [
      rawPhone.replace(/[^0-9+]/g, ''),
      `+${digits}`,
      digits,
      digits.replace(/^998/, ''),
      `+998${digits.slice(-9)}`,
    ];
    const unique = [...new Set(variants)];

    const client = await this.prisma.client.findFirst({
      where: { phone: { in: unique } },
      include: { tenant: { select: { id: true, name: true } } },
    });

    if (!client) return null;

    await this.prisma.telegramUser.update({
      where: { chatId },
      data: {
        clientId: client.id,
        tenantId: client.tenantId,
        phone: client.phone,
        state: 'idle',
        stateData: null,
      },
    });

    return client;
  }

  // ─── Client data queries ───────────────────────────────────────────

  /**
   * Current balance for the linked client.
   * Positive = store owes client. Negative = client owes store.
   */
  async getClientBalance(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true, fullName: true, phone: true },
    });

    const txns = await this.prisma.clientTransaction.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'desc' },
    });

    let balanceUzs = 0;
    let balanceUsd = 0;

    for (const tx of txns) {
      const sign = tx.type === 'income' ? 1 : -1;
      if ((tx.currency as string) === 'UZS') balanceUzs += sign * Number(tx.amount);
      else balanceUsd += sign * Number(tx.amount);
    }

    return {
      client,
      balanceUzs: +balanceUzs.toFixed(0),
      balanceUsd: +balanceUsd.toFixed(2),
    };
  }

  /** Recent ClientTransactions for the linked client */
  async getClientTransactions(tenantId: string, clientId: string, limit = 15) {
    return this.prisma.clientTransaction.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Recent Sales for the linked client */
  async getClientSales(tenantId: string, clientId: string, limit = 10) {
    return this.prisma.sale.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: { include: { product: { select: { name: true } } } } },
    });
  }

  // ─── Push Notifications ────────────────────────────────────────────

  /**
   * Send a Telegram message to the client with the given clientId.
   * Silently fails if the client has no linked Telegram account.
   */
  async notifyClient(clientId: string, message: string): Promise<void> {
    try {
      const tgUsers = await this.prisma.telegramUser.findMany({
        where: { clientId },
        select: { chatId: true },
      });

      for (const { chatId } of tgUsers) {
        try {
          await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (err) {
          this.logger.warn(`Failed to notify client ${clientId} at chatId ${chatId}: ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`notifyClient error for ${clientId}:`, err);
    }
  }

  /**
   * Notify a client that a new sale with debt was created for them.
   */
  async notifyClientNewDebt(
    clientId: string,
    data: {
      date: string;
      amount: number;
      currency: string;
      description?: string;
      balanceUzs: number;
      balanceUsd: number;
    },
    lang: Lang = 'en',
  ): Promise<void> {
    const { i18n } = await import('./telegram.i18n');
    const msg = i18n('notify_new_debt', lang, {
      date: data.date,
      amount: this.fmt(data.amount),
      currency: data.currency,
      description: data.description ?? '—',
      balanceUzs: this.fmt(Math.abs(data.balanceUzs)),
      balanceUsd: this.fmtUsd(Math.abs(data.balanceUsd)),
    });
    await this.notifyClient(clientId, msg);
  }

  /**
   * Notify a client that a payment was recorded for them.
   */
  async notifyClientPaymentReceived(
    clientId: string,
    data: {
      date: string;
      amount: number;
      currency: string;
      balanceUzs: number;
      balanceUsd: number;
    },
    lang: Lang = 'en',
  ): Promise<void> {
    const { i18n } = await import('./telegram.i18n');
    const msg = i18n('notify_payment_received', lang, {
      date: data.date,
      amount: this.fmt(data.amount),
      currency: data.currency,
      balanceUzs: this.fmt(Math.abs(data.balanceUzs)),
      balanceUsd: this.fmtUsd(Math.abs(data.balanceUsd)),
    });
    await this.notifyClient(clientId, msg);
  }

  /**
   * Notify a client about a new sale/order (with or without debt).
   */
  async notifyClientNewSale(
    clientId: string,
    data: {
      date: string;
      total: number;
      paid: number;
      debt: number;
      currency: string;
      itemCount: number;
    },
    lang: Lang = 'en',
  ): Promise<void> {
    const { i18n } = await import('./telegram.i18n');
    const debtLine =
      data.debt > 0
        ? i18n('debt_line_uzs', lang, { amount: this.fmt(data.debt) })
        : '';

    const msg = i18n('notify_new_sale', lang, {
      date: data.date,
      total: this.fmt(data.total),
      currency: data.currency,
      paid: this.fmt(data.paid),
      debtLine,
      items: String(data.itemCount),
    });
    await this.notifyClient(clientId, msg);
  }

  /**
   * Send a debt reminder to a specific client.
   */
  async sendDebtReminderToClient(
    clientId: string,
    tenantId: string,
    lang: Lang = 'en',
  ): Promise<boolean> {
    const { balanceUzs, balanceUsd, client } = await this.getClientBalance(tenantId, clientId);
    if (!client) return false;
    if (balanceUzs >= 0 && balanceUsd >= 0) return false; // no debt

    const { i18n } = await import('./telegram.i18n');
    const msg = i18n('notify_debt_reminder', lang, {
      name: client.fullName,
      balanceUzs: this.fmt(Math.abs(Math.min(0, balanceUzs))),
      balanceUsd: this.fmtUsd(Math.abs(Math.min(0, balanceUsd))),
    });
    await this.notifyClient(clientId, msg);
    return true;
  }

  /**
   * Send debt reminders to ALL clients with linked Telegram accounts
   * who have a negative balance for the given tenant.
   */
  async sendDebtRemindersToAllClients(tenantId: string): Promise<number> {
    const linkedClients = await this.prisma.telegramUser.findMany({
      where: { tenantId, clientId: { not: null } },
      select: { clientId: true, language: true },
    });

    let notified = 0;
    for (const { clientId, language } of linkedClients) {
      if (!clientId) continue;
      const lang = (language as Lang) ?? 'en';
      const sent = await this.sendDebtReminderToClient(clientId, tenantId, lang);
      if (sent) notified++;
    }
    return notified;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  fmt(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  fmtUsd(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
