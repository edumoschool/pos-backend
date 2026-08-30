import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BrandCategoriesService } from './brand-categories.service';
import { CreateBrandCategoryDto, UpdateBrandCategoryDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Brand Categories')
@ApiBearerAuth()
@Controller('brand-categories')
export class BrandCategoriesController {
  constructor(private service: BrandCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a brand category' })
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateBrandCategoryDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List brand categories' })
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
  @ApiOperation({ summary: 'Get brand category by ID' })
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a brand category' })
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandCategoryDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a brand category' })
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(tenantId, id);
  }
}
