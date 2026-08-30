import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PartyTransactionType {
  income = 'income',
  outcome = 'outcome',
}

export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

export enum PaymentMethod {
  cash = 'cash',
  card = 'card',
  transfer = 'transfer',
  other = 'other',
}

export class CreateSupplierTransactionDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ enum: PartyTransactionType, description: 'income = supplier refunds/pays us; outcome = we pay the supplier (or debt to supplier)' })
  @IsEnum(PartyTransactionType)
  type: PartyTransactionType;

  @ApiProperty({ example: 2500000 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ enum: Currency, default: Currency.UZS })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Payment for goods received' })
  @IsOptional()
  @IsString()
  description?: string;
}
