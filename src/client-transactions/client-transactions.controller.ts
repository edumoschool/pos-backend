import { Controller, Get, Post, Body, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClientTransactionsService } from './client-transactions.service';
import { CreateClientTransactionDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Client Transactions')
@ApiBearerAuth()
@Controller('client-transactions')
export class ClientTransactionsController {
  constructor(private service: ClientTransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a client income or outcome (debt) transaction' })
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateClientTransactionDto,
  ) {
    return this.service.create(tenantId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List client transactions' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.findAll(tenantId, clientId, +page, +limit);
  }

  @Get('balance/:clientId')
  @ApiOperation({ summary: 'Get balance summary for a client (income vs outcome/debt)' })
  clientBalance(
    @CurrentUser('tenantId') tenantId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.service.clientBalance(tenantId, clientId);
  }

  @Get('export/excel')
  @ApiOperation({ summary: 'Export client transactions as Excel file' })
  @ApiQuery({ name: 'clientId', required: false })
  exportExcel(
    @CurrentUser('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.service.exportExcel(tenantId, clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client transaction by ID' })
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a client transaction' })
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenantId, id);
  }
}
