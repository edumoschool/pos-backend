import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsOptional, IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

export class CreateTransactionDto {
  @ApiPropertyOptional({ description: 'Defaults to first branch of tenant if not provided' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ enum: ['income', 'expense'] })
  @IsEnum(['income', 'expense'])
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 150.00 })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  expenseCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  incomeCategoryId?: string;

  @ApiPropertyOptional({ example: 'Monthly rent payment' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Currency, default: Currency.UZS })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}
