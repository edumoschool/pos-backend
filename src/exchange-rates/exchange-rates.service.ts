import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CbuRateResponse {
  id: number;
  Code: string;
  Ccy: string;
  CcyNm_EN: string;
  Nominal: string;
  Rate: string;
  Diff: string;
  Date: string;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly CBU_BASE_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD';

  constructor(private prisma: PrismaService) {}

  /**
   * Return today's USD→UZS rate.
   * Fetches from CBU if not cached in DB, then stores it.
   */
  async getToday(): Promise<{ date: string; usdToUzs: number; source: 'cache' | 'cbu' }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cached = await this.prisma.exchangeRate.findUnique({
      where: { date: today },
    });

    if (cached) {
      return {
        date: this.formatDate(cached.date),
        usdToUzs: Number(cached.usdToUzs),
        source: 'cache',
      };
    }

    const rate = await this.fetchFromCbu(today);

    return {
      date: this.formatDate(today),
      usdToUzs: rate,
      source: 'cbu',
    };
  }

  /**
   * Return the latest stored exchange rate.
   */
  async getLatest() {
    const rate = await this.prisma.exchangeRate.findFirst({
      orderBy: { date: 'desc' },
    });
    if (!rate) {
      // No cached rate — fetch today's
      return this.getToday();
    }
    return {
      date: this.formatDate(rate.date),
      usdToUzs: Number(rate.usdToUzs),
      source: 'cache' as const,
    };
  }

  /**
   * List all stored exchange rates (most recent first).
   */
  findAll() {
    return this.prisma.exchangeRate.findMany({
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Convert amount from one currency to another using today's rate.
   */
  async convert(amount: number, from: 'USD' | 'UZS', to: 'USD' | 'UZS'): Promise<number> {
    if (from === to) return amount;
    const { usdToUzs } = await this.getLatest();
    if (from === 'USD' && to === 'UZS') return +(amount * usdToUzs).toFixed(2);
    return +(amount / usdToUzs).toFixed(6);
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private async fetchFromCbu(date: Date): Promise<number> {
    const dateStr = this.formatDate(date);
    const url = `${this.CBU_BASE_URL}/${dateStr}/`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CBU API returned status ${response.status}`);
      }
      const data = (await response.json()) as CbuRateResponse[];
      if (!data || data.length === 0) {
        throw new Error('CBU API returned empty response');
      }
      const usdToUzs = parseFloat(data[0].Rate);
      if (isNaN(usdToUzs) || usdToUzs <= 0) {
        throw new Error(`Invalid rate received: ${data[0].Rate}`);
      }

      // Upsert to cache
      await this.prisma.exchangeRate.upsert({
        where: { date },
        create: { date, usdToUzs },
        update: { usdToUzs },
      });

      this.logger.log(`Fetched USD→UZS rate for ${dateStr}: ${usdToUzs}`);
      return usdToUzs;
    } catch (err) {
      this.logger.error(`Failed to fetch rate from CBU for ${dateStr}`, err);
      throw new ServiceUnavailableException(
        'Unable to fetch exchange rate from Central Bank of Uzbekistan',
      );
    }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
