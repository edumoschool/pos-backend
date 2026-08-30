import { Module } from '@nestjs/common';
import { BrandCategoriesService } from './brand-categories.service';
import { BrandCategoriesController } from './brand-categories.controller';

@Module({
  controllers: [BrandCategoriesController],
  providers: [BrandCategoriesService],
  exports: [BrandCategoriesService],
})
export class BrandCategoriesModule {}
