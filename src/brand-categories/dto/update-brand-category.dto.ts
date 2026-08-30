import { PartialType } from '@nestjs/swagger';
import { CreateBrandCategoryDto } from './create-brand-category.dto';

export class UpdateBrandCategoryDto extends PartialType(CreateBrandCategoryDto) {}
