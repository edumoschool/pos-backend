import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
        throw new NotFoundException(
          `Products not found or inactive: ${missing.join(', ')}`,
        );
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const inventory = product.inventory[0];

        if (!inventory) {
          throw new BadRequestException(
            `No inventory record for product "${product.name}"`,
          );
        }

        if (Number(inventory.quantity) < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}": available ${inventory.quantity}, requested ${item.quantity}`,
          );
        }
      }

      // ── 2. Compute totals ─────────────────────────────────────────
      let totalAmount = 0;

      const itemsData = dto.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const unitPrice = item.unitPrice ?? Number(product.sellingPrice);
        const costPrice = Number(product.inventory[0].costPrice || product.costPrice);
        const totalPrice = unitPrice * item.quantity;
        totalAmount += totalPrice;

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          costPrice,
          totalPrice,
        };
      });

      totalAmount = totalAmount - discount;
      const paidAmount = dto.paidAmount;
      const debtAmount = Math.max(0, totalAmount - paidAmount);
      const status = debtAmount > 0 ? 'debt' : 'completed';

      if (paidAmount > totalAmount) {
        throw new BadRequestException(
          `Paid amount (${paidAmount}) cannot exceed total amount (${totalAmount})`,
        );
      }

      if (debtAmount > 0 && !dto.clientId) {
        throw new BadRequestException(
          'A client must be specified when paidAmount is less than the total (debt sale)',
        );
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
      for (const item of dto.items) {
        const inventory = productMap.get(item.productId)!.inventory[0];
        const before = Number(inventory.quantity);
        const after = before - item.quantity;

        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: after },
        });

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
      if (dto.clientId && debtAmount > 0) {
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
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  // ─── Cancel ───────────────────────────────────────────────────────────

  async cancel(id: string, tenantId: string, userId: string) {
    const sale = await this.findOne(id, tenantId);

    if (sale.status === 'cancelled') {
      throw new BadRequestException('Sale is already cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Restore inventory for each item
      for (const item of sale.items) {
        const inventory = await tx.inventory.findFirst({
          where: { productId: item.productId, tenantId },
        });

        if (inventory) {
          const before = Number(inventory.quantity);
          const after = before + Number(item.quantity);

          await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: after },
          });

          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              tenantId,
              userId,
              type: 'in',
              quantity: Number(item.quantity),
              before,
              after,
              note: `Cancelled sale #${id}`,
            },
          });
        }
      }

      // If there was client debt, create an offsetting ClientTransaction (income = debt reversed)
      if (sale.clientId && Number(sale.debtAmount) > 0) {
        await tx.clientTransaction.create({
          data: {
            tenantId,
            clientId: sale.clientId,
            userId,
            saleId: sale.id,
            type: 'income',
            amount: sale.debtAmount,
            currency: sale.currency,
            description: `Debt reversal — cancelled sale #${id}`,
          },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'cancelled' },
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
