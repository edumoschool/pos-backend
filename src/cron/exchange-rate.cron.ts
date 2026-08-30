import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

@Injectable()
export class ExchangeRateCron {
  private readonly logger = new Logger(ExchangeRateCron.name);

  constructor(private exchangeRatesService: ExchangeRatesService) {}

  @Cron('0 9 * * *') // Every day at 9:00 AM
  async handleFetchDailyRate() {
    this.logger.log('Fetching daily exchange rate from CBU...');

    try {
      const result = await this.exchangeRatesService.getToday();
      this.logger.log(`Daily rate fetched: USD→UZS = ${result.usdToUzs} (source: ${result.source})`);
    } catch (error) {
      this.logger.error('Failed to fetch daily exchange rate', error);
    }
  }
}
