import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private service: SalesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a sale — anonymous (walk-in) or linked to a client',
  })
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSaleDto,
  ) {
    return this.service.create(tenantId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List sales with optional filters' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['completed', 'debt', 'cancelled'] })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.findAll(tenantId, { clientId, branchId, status, from, to, page: +page, limit: +limit });
  }

  @Get('summary')
  @ApiOperation({ summary: "Today's revenue, profit, and debt summary" })
  @ApiQuery({ name: 'branchId', required: false })
  getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.summary(tenantId, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sale detail including items and linked client transactions' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a sale — restores inventory and reverses client debt if applicable',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.cancel(id, tenantId, userId);
  }
}
