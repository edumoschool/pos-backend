import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  create(tenantId: string, dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId, isActive: true };
    const [data, total] = await Promise.all([
      this.prisma.branch.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.branch.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { users: true, sales: true, transactions: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, tenantId: string, dto: UpdateBranchDto) {
    await this.findOne(id, tenantId);
    return this.prisma.branch.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
