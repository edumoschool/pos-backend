import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'Expo push token or array of tokens',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsNotEmpty()
  to: string | string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'JSON data payload' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ['default', 'normal', 'high'] })
  @IsOptional()
  @IsEnum(['default', 'normal', 'high'])
  priority?: 'default' | 'normal' | 'high';

  @ApiPropertyOptional({ description: 'Time to live in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ttl?: number;

  @ApiPropertyOptional({ description: 'Play sound on receipt (iOS)' })
  @IsOptional()
  @IsString()
  sound?: string | null;

  @ApiPropertyOptional({ description: 'Badge count (iOS)' })
  @IsOptional()
  @IsNumber()
  badge?: number;

  @ApiPropertyOptional({ description: 'Android notification channel ID' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Notification category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Whether the content is mutable (iOS)' })
  @IsOptional()
  @IsBoolean()
  mutableContent?: boolean;
}
