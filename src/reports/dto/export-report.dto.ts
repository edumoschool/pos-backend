import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ExportReportType {
  FINANCIAL_SUMMARY = 'financial-summary',
  TRANSACTIONS_BY_DAY = 'transactions-by-day',
  EXPENSES_BY_CATEGORY = 'expenses-by-category',
  INCOME_BY_CATEGORY = 'income-by-category',
  INVENTORY = 'inventory',
  CLIENT_BALANCES = 'client-balances',
  SUPPLIER_BALANCES = 'supplier-balances',
}

export enum ExportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
}

export class ExportReportDto {
  @ApiProperty({ enum: ExportReportType })
  @IsEnum(ExportReportType)
  reportType: ExportReportType;

  @ApiProperty({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}
