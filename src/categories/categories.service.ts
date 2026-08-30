import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  create(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.category.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, tenantId: string, dto: UpdateCategoryDto) {
    await this.findOne(id, tenantId);
    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.category.delete({ where: { id } });
  }
}
