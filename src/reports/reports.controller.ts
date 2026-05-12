import { Controller, Get, Post, Delete, Query, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportExportService } from './report-export.service';
import { ExportReportDto } from './dto/export-report.dto';
import { CurrentUser, Roles } from '../auth/decorators';
import { UserRole } from '../generated/prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(UserRole.owner, UserRole.super_admin)
@Controller('reports')
export class ReportsController {
  constructor(
    private service: ReportsService,
    private reportExportService: ReportExportService,
  ) {}

  @Get('financial-summary')
  @ApiOperation({ summary: 'Financial summary (income, expenses, net profit)' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  financialSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.financialSummary(tenantId, branchId, from, to);
  }

  @Get('transactions-by-day')
  @ApiOperation({ summary: 'Transactions grouped by day (income & expenses)' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  transactionsByDay(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.transactionsByDay(tenantId, branchId, from, to);
  }

  @Get('expenses-by-category')
  @ApiOperation({ summary: 'Expenses grouped by category' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  expensesByCategory(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.expensesByCategory(tenantId, branchId, from, to);
  }

  @Get('income-by-category')
  @ApiOperation({ summary: 'Income grouped by category' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  incomeByCategory(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.incomeByCategory(tenantId, branchId, from, to);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Inventory report with stock values and low-stock items' })
  inventoryReport(@CurrentUser('tenantId') tenantId: string) {
    return this.service.inventoryReport(tenantId);
  }

  @Get('client-balances')
  @ApiOperation({ summary: 'All client income/outcome balances' })
  clientBalances(@CurrentUser('tenantId') tenantId: string) {
    return this.service.clientBalances(tenantId);
  }

  @Get('supplier-balances')
  @ApiOperation({ summary: 'All supplier income/outcome balances' })
  supplierBalances(@CurrentUser('tenantId') tenantId: string) {
    return this.service.supplierBalances(tenantId);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Active products list' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  topProducts(
    @CurrentUser('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.topProducts(tenantId, undefined, limit ? parseInt(limit, 10) : undefined);
  }

  // ─── Report Export Endpoints ──────────────────────────────────────

  @Post('export')
  @ApiOperation({ summary: 'Export report to file (pdf, excel, csv) and upload to storage' })
  exportReport(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ExportReportDto,
  ) {
    return this.reportExportService.exportReport(tenantId, userId, dto);
  }

  @Get('exports')
  @ApiOperation({ summary: 'List all exported reports' })
  listExports(@CurrentUser('tenantId') tenantId: string) {
    return this.reportExportService.getReports(tenantId);
  }

  @Get('exports/:id/url')
  @ApiOperation({ summary: 'Get download URL for an exported report' })
  getExportUrl(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportExportService.getReportUrl(tenantId, id);
  }

  @Delete('exports/:id')
  @ApiOperation({ summary: 'Delete an exported report' })
  deleteExport(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportExportService.deleteReport(tenantId, id);
  }
}
