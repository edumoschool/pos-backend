import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { LowStockCron } from './low-stock.cron';
import { DebtReminderCron } from './debt-reminder.cron';
import { ExchangeRateCron } from './exchange-rate.cron';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, ExchangeRatesModule],
  providers: [LowStockCron, DebtReminderCron, ExchangeRateCron],
})
export class CronModule {}
