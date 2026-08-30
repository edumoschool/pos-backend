import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeCategoryDto, UpdateIncomeCategoryDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class IncomeCategoriesService {
  constructor(private prisma: PrismaService) {}

  create(tenantId: string, dto: CreateIncomeCategoryDto) {
    return this.prisma.incomeCategory.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.incomeCategory.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.incomeCategory.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(tenantId: string, id: string) {
    const category = await this.prisma.incomeCategory.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Income category not found');
    return category;
  }

  async update(tenantId: string, id: string, dto: UpdateIncomeCategoryDto) {
    await this.findOne(tenantId, id);
    return this.prisma.incomeCategory.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.incomeCategory.delete({ where: { id } });
  }
}
