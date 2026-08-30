import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  create(tenantId: string, dto: CreateUnitDto) {
    return this.prisma.unit.create({
      data: { ...dto, tenantId },
    });
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.unit.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, tenantId },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async update(id: string, tenantId: string, dto: UpdateUnitDto) {
    await this.findOne(id, tenantId);
    return this.prisma.unit.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.unit.delete({ where: { id } });
  }
}
