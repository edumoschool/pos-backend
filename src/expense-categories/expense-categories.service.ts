import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  create(tenantId: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.expenseCategory.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.expenseCategory.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    return category;
  }

  async update(id: string, tenantId: string, dto: UpdateExpenseCategoryDto) {
    await this.findOne(id, tenantId);
    return this.prisma.expenseCategory.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.expenseCategory.delete({ where: { id } });
  }
}
