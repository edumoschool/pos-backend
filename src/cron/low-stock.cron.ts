import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getLowStockMessage } from '../notifications/notification-messages';

@Injectable()
export class LowStockCron {
  private readonly logger = new Logger(LowStockCron.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleLowStockCheck() {
    this.logger.log('Running daily low stock check...');

    const lowStockItems = await this.prisma.$queryRaw<
      { product_name: string; quantity: number; tenant_id: string; language: string }[]
    >`
      SELECT i.quantity, i.tenant_id, p.name AS product_name, t.language
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.min_quantity IS NOT NULL
        AND i.quantity <= i.min_quantity
    `;

    // Group low stock items by tenant
    const groupedByTenant = new Map<string, { language: string; items: { name: string; quantity: number }[] }>();

    for (const item of lowStockItems) {
      const tenantId = item.tenant_id;
      if (!groupedByTenant.has(tenantId)) {
        groupedByTenant.set(tenantId, {
          language: item.language ?? 'en',
          items: [],
        });
      }
      groupedByTenant.get(tenantId)!.items.push({
        name: item.product_name,
        quantity: Number(item.quantity),
      });
    }

    // Send notifications per tenant
    for (const [tenantId, { language, items }] of groupedByTenant) {
      if (items.length === 0) continue;

      const msg = getLowStockMessage(language);

      let body: string;
      if (items.length === 1) {
        body = msg.single(items[0].name, items[0].quantity);
      } else {
        const itemsList = items.map((i) => msg.itemFormat(i.name, i.quantity)).join('\n');
        body = msg.multi(items.length, itemsList);
      }

      try {
        await this.notificationsService.sendToTenant(tenantId, {
          title: msg.title,
          body,
        });
        this.logger.log(`Low stock notification sent to tenant ${tenantId} (${items.length} items)`);
      } catch (error) {
        this.logger.error(`Failed to send low stock notification to tenant ${tenantId}`, error);
      }
    }

    this.logger.log(`Low stock check complete. Notified ${groupedByTenant.size} tenants.`);
  }
}
