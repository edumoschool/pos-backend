import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean, IsUUID, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Latest Apple smartphone' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  brandCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ example: 800.00 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  costPrice?: number;

  @ApiPropertyOptional({ example: 999.99 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sellingPrice?: number;

  @ApiPropertyOptional({ enum: Currency, default: Currency.UZS })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 100, default: 0, description: 'Initial inventory quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ example: 10, default: 0, description: 'Minimum stock alert threshold' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minQuantity?: number;
}
