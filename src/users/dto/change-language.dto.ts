import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeLanguageDto {
  @ApiProperty({ enum: ['en', 'uz', 'ru'], example: 'uz' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['en', 'uz', 'ru'])
  language: 'en' | 'uz' | 'ru';
}
