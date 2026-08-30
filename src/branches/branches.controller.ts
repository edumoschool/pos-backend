import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto';
import { CurrentUser, Roles } from '../auth/decorators';

@ApiTags('Branches')
@ApiBearerAuth()
@Roles('owner', 'super_admin')
@Controller('branches')
export class BranchesController {
  constructor(private service: BranchesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a branch' })
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateBranchDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @Roles('owner', 'super_admin', 'seller')
  @ApiOperation({ summary: 'List all branches' })
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
  @Roles('owner', 'super_admin', 'seller')
  @ApiOperation({ summary: 'Get branch by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a branch' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.service.update(id, tenantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a branch' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
