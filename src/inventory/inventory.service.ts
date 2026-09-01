import { Injectable, Logger } from '@nestjs/common';
import { I18nNotFoundException } from '../i18n/i18n.exception';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInventoryDto, UpdateInventoryDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  create(tenantId: string, dto: CreateInventoryDto) {
    return this.prisma.inventory.create({
      data: { ...dto, tenantId } as any,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20, search?: string) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = {
      tenantId,
      ...(search && {
        product: {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
          ],
        },
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, sku: true, sellingPrice: true, currency: true, unit: true },
          },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { product: { name: 'asc' } },
        skip,
        take,
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  findLowStock(tenantId: string) {
    return this.prisma.inventory.findMany({
      where: {
        tenantId,
        minQuantity: { not: null },
      },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { quantity: 'asc' },
    }).then(items =>
      // `quantity`/`minQuantity` are Prisma.Decimal objects — comparing them
      // with `<=` directly coerces to strings and compares lexicographically
      // ("195" <= "20" is true!), not numerically. Convert to Number first.
      items.filter(
        item => item.minQuantity !== null && Number(item.quantity) <= Number(item.minQuantity),
      ),
    );
  }

  async findOne(id: string, tenantId: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!inventory) throw new I18nNotFoundException('errors.inventory.notFound');
    return inventory;
  }

  async adjust(
    id: string,
    tenantId: string,
    userId: string,
    dto: UpdateInventoryDto & { note?: string },
  ) {
    const inventory = await this.findOne(id, tenantId);
    const { note, quantity, ...rest } = dto as any;

    // The stock write and its movement row are committed together, so an
    // adjustment can never land without the ledger entry that explains it.
    const { updated, moved } = await this.prisma.$transaction(async (tx) => {
      const before = new Prisma.Decimal(inventory.quantity);
      const changed =
        quantity !== undefined && !before.equals(new Prisma.Decimal(quantity));

      const updated = await tx.inventory.update({
        where: { id },
        data: {
          ...(rest as any),
          ...(quantity !== undefined && { quantity }),
        },
        include: {
          product: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      });

      if (changed) {
        const after = new Prisma.Decimal(quantity);
        const diff = after.minus(before);
        const type = diff.greaterThan(0)
          ? 'in'
          : diff.lessThan(0)
            ? 'out'
            : 'adjustment';

        await tx.inventoryMovement.create({
          data: {
            inventoryId: id,
            tenantId,
            userId,
            type,
            quantity: diff.abs(),
            before,
            after,
            note: note ?? null,
          },
        });
      }

      return { updated, moved: changed };
    });

    if (moved) {
      // Fire low-stock notification asynchronously, after the commit.
      this.checkAndNotifyLowStock(tenantId, [inventory.productId]).catch(
        (err) => this.logger.error('Failed to send low-stock notification', err),
      );
    }

    return updated;
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.inventory.delete({ where: { id } });
  }

  getMovements(tenantId: string, inventoryId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        ...(inventoryId && { inventoryId }),
      },
      include: {
        inventory: {
          include: { product: { select: { id: true, name: true } } },
        },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Check if any of the given products are low in stock and notify the tenant owner.
   */
  async checkAndNotifyLowStock(tenantId: string, productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;

    const { getLowStockMessage } = await import('../notifications/notification-messages');

    const lowStockItems = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        productId: { in: productIds },
        minQuantity: { not: null },
      },
      include: {
        product: { select: { id: true, name: true } },
      },
    });

    const alertItems = lowStockItems.filter(
      (item) => item.minQuantity !== null && Number(item.quantity) <= Number(item.minQuantity),
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
      data: { type: 'low_stock', productIds: alertItems.map((i) => i.product.id) },
    });
  }
}
