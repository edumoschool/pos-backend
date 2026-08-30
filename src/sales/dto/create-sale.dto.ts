import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleItemDto } from './sale-item.dto';

export enum PaymentMethod {
  cash = 'cash',
  card = 'card',
  transfer = 'transfer',
  other = 'other',
}

export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

export class CreateSaleDto {
  @ApiProperty({ type: [SaleItemDto], description: 'Line items (min 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiPropertyOptional({ example: 'uuid', description: 'Client ID — omit for walk-in/anonymous sale' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.cash })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ enum: Currency, default: Currency.UZS })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiProperty({ example: 1000, description: 'Amount actually paid now (0 = full debt, equal to total = fully paid)' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  paidAmount: number;

  @ApiPropertyOptional({ example: 50, default: 0, description: 'Flat discount off the total' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discount?: number;

  @ApiPropertyOptional({ example: 'Wholesale deal' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Branch ID' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
