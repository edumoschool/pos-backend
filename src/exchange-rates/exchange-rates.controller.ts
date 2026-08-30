import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExchangeRatesService } from './exchange-rates.service';

@ApiTags('Exchange Rates')
@ApiBearerAuth()
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private service: ExchangeRatesService) {}

  @Get('today')
  @ApiOperation({ summary: "Get today's USD→UZS rate (fetches from CBU if not cached)" })
  getToday() {
    return this.service.getToday();
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get the most recent stored rate' })
  getLatest() {
    return this.service.getLatest();
  }

  @Get('convert')
  @ApiOperation({ summary: 'Convert amount between USD and UZS' })
  @ApiQuery({ name: 'amount', type: Number })
  @ApiQuery({ name: 'from', enum: ['USD', 'UZS'] })
  @ApiQuery({ name: 'to', enum: ['USD', 'UZS'] })
  convert(
    @Query('amount') amount: string,
    @Query('from') from: 'USD' | 'UZS',
    @Query('to') to: 'USD' | 'UZS',
  ) {
    return this.service.convert(parseFloat(amount), from, to);
  }

  @Get()
  @ApiOperation({ summary: 'List all stored exchange rates' })
  findAll() {
    return this.service.findAll();
  }
}
