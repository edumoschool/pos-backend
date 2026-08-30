import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getDebtReminderMessage } from '../notifications/notification-messages';

@Injectable()
export class DebtReminderCron {
  private readonly logger = new Logger(DebtReminderCron.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  @Cron('0 7 * * *') // Every day at 7:00 AM
  async handleDebtReminderCheck() {
    this.logger.log('Running daily debt reminder check...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    // Find client transactions with due dates within the next 3 days (including overdue)
    const comingDebts = await this.prisma.clientTransaction.findMany({
      where: {
        type: 'outcome',
        dueDate: {
          not: null,
          lte: threeDaysFromNow,
        },
      },
      include: {
        client: { select: { fullName: true } },
        tenant: { select: { id: true, language: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Group by tenant
    const groupedByTenant = new Map<
      string,
      { language: string; items: { clientName: string; amount: string; dueDate: string }[] }
    >();

    for (const debt of comingDebts) {
      const tenantId = debt.tenantId;
      if (!groupedByTenant.has(tenantId)) {
        groupedByTenant.set(tenantId, {
          language: (debt.tenant as any).language ?? 'en',
          items: [],
        });
      }

      const dueDate = debt.dueDate!;
      const formattedDate = dueDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      groupedByTenant.get(tenantId)!.items.push({
        clientName: debt.client.fullName,
        amount: `${Number(debt.amount)} ${debt.currency}`,
        dueDate: formattedDate,
      });
    }

    // Send notifications per tenant
    for (const [tenantId, { language, items }] of groupedByTenant) {
      if (items.length === 0) continue;

      const msg = getDebtReminderMessage(language);

      let body: string;
      if (items.length === 1) {
        body = msg.single(items[0].clientName, items[0].amount, items[0].dueDate);
      } else {
        const itemsList = items
          .map((i) => msg.itemFormat(i.clientName, i.amount, i.dueDate))
          .join('\n');
        body = msg.multi(items.length, itemsList);
      }

      try {
        await this.notificationsService.sendToTenant(tenantId, {
          title: msg.title,
          body,
        });
        this.logger.log(`Debt reminder sent to tenant ${tenantId} (${items.length} debts)`);
      } catch (error) {
        this.logger.error(`Failed to send debt reminder to tenant ${tenantId}`, error);
      }
    }

    this.logger.log(`Debt reminder check complete. Notified ${groupedByTenant.size} tenants.`);
  }
}
