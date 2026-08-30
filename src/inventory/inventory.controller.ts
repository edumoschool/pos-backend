import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto, UpdateInventoryDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create an inventory record' })
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateInventoryDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List inventory for a tenant' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.findAll(tenantId, +page, +limit);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get low-stock items' })
  findLowStock(@CurrentUser('tenantId') tenantId: string) {
    return this.service.findLowStock(tenantId);
  }

  @Get('movements')
  @ApiOperation({ summary: 'List inventory movements (full history)' })
  @ApiQuery({ name: 'inventoryId', required: false })
  getMovements(
    @CurrentUser('tenantId') tenantId: string,
    @Query('inventoryId') inventoryId?: string,
  ) {
    return this.service.getMovements(tenantId, inventoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory record by ID (includes last 20 movements)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Adjust inventory (quantity change auto-creates a movement record)' })
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.service.adjust(id, tenantId, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an inventory record' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
