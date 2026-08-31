import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Fields an owner is allowed to change on their own tenant.
 * Subscription and activation stay super_admin-only via UpdateTenantDto.
 */
export class UpdateOwnTenantDto {
  @ApiPropertyOptional({ example: 'My Store' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ enum: ['en', 'uz', 'ru'] })
  @IsOptional()
  @IsEnum(['en', 'uz', 'ru'])
  language?: string;
}
