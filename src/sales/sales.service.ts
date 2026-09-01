import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  I18nBadRequestException,
  I18nNotFoundException,
} from '../i18n/i18n.exception';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateSaleDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

const SALE_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, name: true, unit: true } },
    },
  },
  client: { select: { id: true, fullName: true, phone: true } },
  user: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Optional() private telegram: TelegramService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSaleDto) {
    const currency = (dto.currency ?? 'UZS') as any;
    const discount = dto.discount ?? 0;

    return this.prisma.$transaction(async (tx) => {
      // ── 1. Validate products & stock ──────────────────────────────
      const productIds = dto.items.map((i) => i.productId);

      const products = await tx.product.findMany({
        where: { id: { in: productIds }, tenantId, isActive: true },
        include: {
          inventory: { where: { tenantId } },
        },
      });

      if (products.length !== productIds.length) {
        const foundIds = products.map((p) => p.id);
        const missing = productIds.filter((id) => !foundIds.includes(id));
        throw new I18nNotFoundException('errors.sale.productsNotFound', {
          ids: missing.join(', '),
        });
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const inventory = product.inventory[0];

        if (!inventory) {
          throw new I18nBadRequestException('errors.sale.noInventory', {
            name: product.name,
          });
        }

        if (new Prisma.Decimal(inventory.quantity).lessThan(item.quantity)) {
          throw new I18nBadRequestException('errors.sale.insufficientStock', {
            name: product.name,
            available: String(inventory.quantity),
            requested: item.quantity,
          });
        }
      }

      // ── 2. Compute totals ─────────────────────────────────────────
      // All money is computed with Decimal: these values are persisted to
      // Decimal(12,2) columns and float arithmetic loses precision on them.
      let totalAmount = new Prisma.Decimal(0);

      const itemsData = dto.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const unitPrice = new Prisma.Decimal(
          item.unitPrice ?? product.sellingPrice,
        );
        // `inventory[0].costPrice` is a Prisma.Decimal — an object, so `||`
        // never falls through to product.costPrice even when its value is 0.
        // Check the numeric value explicitly instead.
        const inventoryCostPrice = new Prisma.Decimal(product.inventory[0].costPrice);
        const costPrice = inventoryCostPrice.isZero()
          ? new Prisma.Decimal(product.costPrice)
          : inventoryCostPrice;
        const totalPrice = unitPrice.times(item.quantity);
        totalAmount = totalAmount.plus(totalPrice);

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          costPrice,
          totalPrice,
        };
      });

      totalAmount = totalAmount.minus(discount);
      const paidAmount = new Prisma.Decimal(dto.paidAmount);
      const debtAmount = Prisma.Decimal.max(0, totalAmount.minus(paidAmount));
      const status = debtAmount.greaterThan(0) ? 'debt' : 'completed';

      if (paidAmount.greaterThan(totalAmount)) {
        throw new I18nBadRequestException('errors.sale.paidExceedsTotal', {
          paid: String(paidAmount),
          total: String(totalAmount),
        });
      }

      if (debtAmount.greaterThan(0) && !dto.clientId) {
        throw new I18nBadRequestException('errors.sale.clientRequiredForDebt');
      }

      // ── 3. Create Sale ─────────────────────────────────────────────
      const sale = await tx.sale.create({
        data: {
          tenantId,
          userId,
          branchId: dto.branchId ?? null,
          clientId: dto.clientId ?? null,
          status: status as any,
          paymentMethod: dto.paymentMethod as any,
          currency,
          totalAmount,
          discount,
          paidAmount,
          debtAmount,
          note: dto.note ?? null,
          items: {
            create: itemsData,
          },
        },
        include: SALE_INCLUDE,
      });

      // ── 4. Decrement inventory + record movements ──────────────────
      // The decrement is guarded by `quantity: { gte }` so that two concurrent
      // sales of the same product cannot both pass the check above and drive
      // stock negative. A losing race matches 0 rows and rolls the sale back.
      for (const item of dto.items) {
        const inventory = productMap.get(item.productId)!.inventory[0];
        const product = productMap.get(item.productId)!;

        const result = await tx.inventory.updateMany({
          where: { id: inventory.id, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });

        if (result.count === 0) {
          throw new I18nBadRequestException(
            'errors.sale.insufficientStockConcurrent',
            { name: product.name },
          );
        }

        const updatedInventory = await tx.inventory.findUniqueOrThrow({
          where: { id: inventory.id },
          select: { quantity: true },
        });

        const after = new Prisma.Decimal(updatedInventory.quantity);
        const before = after.plus(item.quantity);

        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            tenantId,
            userId,
            branchId: dto.branchId ?? null,
            type: 'out',
            quantity: item.quantity,
            before,
            after,
            note: `Sale #${sale.id}`,
          },
        });
      }

      // ── 5. Sync ClientTransaction if client + debt exists ──────────
      if (dto.clientId && debtAmount.greaterThan(0)) {
        await tx.clientTransaction.create({
          data: {
            tenantId,
            clientId: dto.clientId,
            userId,
            saleId: sale.id,
            type: 'outcome',
            amount: debtAmount,
            currency,
            paymentMethod: dto.paymentMethod as any,
            description: `Debt from sale #${sale.id}`,
          },
        });
      }

      return sale;
    }).then(async (sale) => {
      // Fire low-stock notification after transaction commits
      const productIds = dto.items.map((i) => i.productId);
      this.checkAndNotifyLowStock(tenantId, productIds).catch((err) =>
        this.logger.error('Failed to send low-stock notification', err),
      );

      // Notify client via Telegram if they have a linked account
      if (this.telegram && dto.clientId) {
        const date = this.telegram.fmtDate(sale.createdAt);
        const total = Number(sale.totalAmount);
        const paid = Number(sale.paidAmount);
        const debt = Number(sale.debtAmount);
        const currency = sale.currency as string;
        const itemCount = (sale as any).items?.length ?? dto.items.length;

        this.telegram
          .notifyClientNewSale(dto.clientId, { date, total, paid, debt, currency, itemCount })
          .catch((err) => this.logger.warn('Telegram notify new sale failed', err));

        if (debt > 0) {
          // Compute updated balance for the debt notification message
          this.telegram
            .getClientBalance(tenantId, dto.clientId)
            .then(({ balanceUzs, balanceUsd }) =>
              this.telegram.notifyClientNewDebt(dto.clientId!, {
                date,
                amount: debt,
                currency,
                description: `Debt from sale on ${date}`,
                balanceUzs,
                balanceUsd,
              }),
            )
            .catch((err) => this.logger.warn('Telegram notify new debt failed', err));
        }
      }

      return sale;
    });
  }

  // ─── Read ─────────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    filters: {
      clientId?: string;
      branchId?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { skip, take, page: p, limit: l } = paginateParams(filters.page ?? 1, filters.limit ?? 20);
    const where = {
      tenantId,
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.branchId && { branchId: filters.branchId }),
      ...(filters.status && { status: filters.status as any }),
      ...((filters.from || filters.to) && {
        createdAt: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({ where, include: SALE_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.sale.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId },
      include: {
        ...SALE_INCLUDE,
        clientTransactions: true,
      },
    });
    if (!sale) throw new I18nNotFoundException('errors.sale.notFound');
    return sale;
  }

  // ─── Cancel ───────────────────────────────────────────────────────────

  async cancel(id: string, tenantId: string, userId: string) {
    const sale = await this.findOne(id, tenantId);

    if (sale.status === 'cancelled') {
      throw new I18nBadRequestException('errors.sale.alreadyCancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Re-assert the status inside the transaction so two concurrent cancels
      // cannot both restore stock and both reverse the debt. Only the request
      // that actually flips the row away from 'cancelled' proceeds.
      const claimed = await tx.sale.updateMany({
        where: { id, tenantId, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });

      if (claimed.count === 0) {
        throw new I18nBadRequestException('errors.sale.alreadyCancelled');
      }

      // Restore inventory for each item
      for (const item of sale.items) {
        const inventory = await tx.inventory.findFirst({
          where: { productId: item.productId, tenantId },
        });

        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: { increment: item.quantity } },
          });

          const restored = await tx.inventory.findUniqueOrThrow({
            where: { id: inventory.id },
            select: { quantity: true },
          });

          const after = new Prisma.Decimal(restored.quantity);
          const before = after.minus(item.quantity);

          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              tenantId,
              userId,
              type: 'in',
              quantity: item.quantity,
              before,
              after,
              note: `Cancelled sale #${id}`,
            },
          });
        }
      }

      // A cancelled sale is void for accounting purposes — remove every
      // ClientTransaction it produced (the original debt entry and any
      // partial payments already recorded against it) instead of leaving an
      // offsetting reversal entry cluttering the client's ledger.
      if (sale.clientId) {
        await tx.clientTransaction.deleteMany({
          where: { saleId: sale.id, tenantId },
        });
      }

      // Status was already set by the claim above; just return the fresh row.
      return tx.sale.findUniqueOrThrow({
        where: { id },
        include: SALE_INCLUDE,
      });
    });
  }

  // ─── Daily summary ────────────────────────────────────────────────────

  async summary(tenantId: string, branchId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        status: { not: 'cancelled' },
        createdAt: { gte: today },
        ...(branchId && { branchId }),
      },
      include: { items: true },
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalDiscount = 0;
    let totalDebt = 0;

    for (const sale of sales) {
      totalRevenue += Number(sale.totalAmount);
      totalDiscount += Number(sale.discount);
      totalDebt += Number(sale.debtAmount);

      for (const item of sale.items) {
        totalCost += Number(item.costPrice) * Number(item.quantity);
      }
    }

    return {
      date: today.toISOString().slice(0, 10),
      salesCount: sales.length,
      totalRevenue: +totalRevenue.toFixed(2),
      totalCost: +totalCost.toFixed(2),
      grossProfit: +(totalRevenue - totalCost).toFixed(2),
      totalDiscount: +totalDiscount.toFixed(2),
      totalDebt: +totalDebt.toFixed(2),
    };
  }

  // ─── Low-stock helper ─────────────────────────────────────────────────

  private async checkAndNotifyLowStock(
    tenantId: string,
    productIds: string[],
  ): Promise<void> {
    if (productIds.length === 0) return;

    const { getLowStockMessage } = await import(
      '../notifications/notification-messages'
    );

    const lowStockItems = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        productId: { in: productIds },
        minQuantity: { not: null },
      },
      include: { product: { select: { id: true, name: true } } },
    });

    const alertItems = lowStockItems.filter(
      (item) =>
        item.minQuantity !== null &&
        Number(item.quantity) <= Number(item.minQuantity),
    );

    if (alertItems.length === 0) return;

    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'owner', isActive: true },
      select: { id: true, expoPushToken: true, language: true },
    });

    if (!owner?.expoPushToken) return;

    const msg = getLowStockMessage(owner.language);
    const itemsList = alertItems
      .map((item) => msg.itemFormat(item.product.name, Number(item.quantity)))
      .join('\n');

    await this.notifications.sendToUser(owner.id, {
      title: msg.title,
      body:
        alertItems.length === 1
          ? msg.single(alertItems[0].product.name, Number(alertItems[0].quantity))
          : msg.multi(alertItems.length, itemsList),
      data: {
        type: 'low_stock',
        productIds: alertItems.map((i) => i.product.id),
      },
    });
  }
}
