import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, sellingPrice: true, currency: true, unit: true },
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
        product: { select: { id: true, name: true, unit: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { quantity: 'asc' },
    }).then(items =>
      items.filter(item => item.minQuantity !== null && item.quantity <= item.minQuantity),
    );
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!inventory) throw new NotFoundException('Inventory record not found');
    return inventory;
  }

  async adjust(
    id: string,
    tenantId: string,
    userId: string,
    dto: UpdateInventoryDto & { note?: string },
  ) {
    const inventory = await this.findOne(id);
    const { note, quantity, ...rest } = dto as any;

    const beforeQty = inventory.quantity;

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: rest as any,
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    // Record a movement if quantity changed
    if (quantity !== undefined && Number(quantity) !== Number(beforeQty)) {
      const after = Number(quantity);
      const before = Number(beforeQty);
      const diff = after - before;
      const type = diff > 0 ? 'in' : diff < 0 ? 'out' : 'adjustment';

      await this.prisma.inventoryMovement.create({
        data: {
          inventoryId: id,
          tenantId,
          userId,
          type,
          quantity: Math.abs(diff),
          before,
          after,
          note: note ?? null,
        },
      });

      // Fire low-stock notification asynchronously
      this.checkAndNotifyLowStock(tenantId, [inventory.productId]).catch(
        (err) => this.logger.error('Failed to send low-stock notification', err),
      );
    }

    // Re-fetch with updated quantity if it was changed
    if (quantity !== undefined) {
      return this.prisma.inventory.update({
        where: { id },
        data: { quantity },
        include: {
          product: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      });
    }

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
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
