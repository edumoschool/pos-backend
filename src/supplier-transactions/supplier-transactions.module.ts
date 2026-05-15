import { Module } from '@nestjs/common';
import { SupplierTransactionsService } from './supplier-transactions.service';
import { SupplierTransactionsController } from './supplier-transactions.controller';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [ExchangeRatesModule],
  controllers: [SupplierTransactionsController],
  providers: [SupplierTransactionsService],
  exports: [SupplierTransactionsService],
})
export class SupplierTransactionsModule {}
