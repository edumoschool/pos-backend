import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ChangeLanguageDto } from './dto';
import { CurrentUser, Roles } from '../auth/decorators';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Patch('me/language')
  @Roles('owner', 'seller', 'super_admin')
  @ApiOperation({ summary: 'Change current user language' })
  changeLanguage(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangeLanguageDto,
  ) {
    return this.service.changeLanguage(userId, dto.language);
  }

  @Post()
  @Roles('owner', 'super_admin')
  @ApiOperation({ summary: 'Create a user (owner/super_admin)' })
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateUserDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @Roles('owner', 'super_admin')
  @ApiOperation({ summary: 'List all users' })
  @ApiQuery({ name: 'role', required: false, enum: ['owner', 'seller', 'super_admin'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('role') role?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.findAll(tenantId, role, +page, +limit);
  }

  @Get(':id')
  @Roles('owner', 'super_admin')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles('owner', 'super_admin')
  @ApiOperation({ summary: 'Update a user' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(id, tenantId, dto);
  }

  @Delete(':id')
  @Roles('owner', 'super_admin')
  @ApiOperation({ summary: 'Deactivate a user' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('tenantId') tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
