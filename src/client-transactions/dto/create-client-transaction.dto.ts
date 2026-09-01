import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
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

export class CreateClientTransactionDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @ApiPropertyOptional({
    example: 'uuid',
    description:
      'Debt sale this payment settles. type must be "income"; the amount is applied to that sale\'s paidAmount/debtAmount (capped at what is still owed) instead of only affecting the client\'s overall balance.',
  })
  @IsOptional()
  @IsUUID()
  saleId?: string;

  @ApiProperty({ enum: PartyTransactionType, description: 'income = client pays us; outcome = debt issued to client' })
  @IsEnum(PartyTransactionType)
  type: PartyTransactionType;

  @ApiProperty({ example: 500000 })
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

  @ApiPropertyOptional({ example: 'Payment for goods delivered' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
