import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsNumber, IsOptional, IsString, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

export class CreateInventoryDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ example: 10, default: 0, description: 'Low-stock alert threshold' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minQuantity?: number;

  @ApiPropertyOptional({ example: 500, description: 'Maximum stock level' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxQuantity?: number;

  @ApiPropertyOptional({ example: 85000, description: 'Purchase cost price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  costPrice?: number;

  @ApiPropertyOptional({ enum: Currency, default: Currency.UZS, description: 'Currency for cost price' })
  @IsOptional()
  @IsEnum(Currency)
  costCurrency?: Currency;

  @ApiPropertyOptional({ example: 'Shelf A-12', description: 'Physical warehouse location' })
  @IsOptional()
  @IsString()
  location?: string;
}
