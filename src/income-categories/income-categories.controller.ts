import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IncomeCategoriesService } from './income-categories.service';
import { CreateIncomeCategoryDto, UpdateIncomeCategoryDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Income Categories')
@ApiBearerAuth()
@Controller('income-categories')
export class IncomeCategoriesController {
  constructor(private service: IncomeCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create an income category' })
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateIncomeCategoryDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List income categories' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.findAll(tenantId, +page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get income category by ID' })
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an income category' })
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncomeCategoryDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an income category' })
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(tenantId, id);
  }
}
