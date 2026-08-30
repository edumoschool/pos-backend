import { Controller, Get, Post, Body, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupplierTransactionsService } from './supplier-transactions.service';
import { CreateSupplierTransactionDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Supplier Transactions')
@ApiBearerAuth()
@Controller('supplier-transactions')
export class SupplierTransactionsController {
  constructor(private service: SupplierTransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a supplier income or outcome (debt) transaction' })
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSupplierTransactionDto,
  ) {
    return this.service.create(tenantId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List supplier transactions' })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('supplierId') supplierId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.findAll(tenantId, supplierId, +page, +limit);
  }

  @Get('balance/:supplierId')
  @ApiOperation({ summary: 'Get balance summary for a supplier (income vs outcome/debt)' })
  supplierBalance(
    @CurrentUser('tenantId') tenantId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.service.supplierBalance(tenantId, supplierId);
  }

  @Get('export/excel')
  @ApiOperation({ summary: 'Export supplier transactions as Excel file' })
  @ApiQuery({ name: 'supplierId', required: false })
  exportExcel(
    @CurrentUser('tenantId') tenantId: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.service.exportExcel(tenantId, supplierId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a supplier transaction by ID' })
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a supplier transaction' })
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenantId, id);
  }
}
