import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { I18nNotFoundException } from '../i18n/i18n.exception';
import { CreateTenantDto, UpdateTenantDto, UpdateOwnTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: dto as any });
  }

  findAll() {
    return this.prisma.tenant.findMany({
      include: { subscriptionPlan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscriptionPlan: true,
        branches: true,
        _count: { select: { users: true, products: true } },
      },
    });
    if (!tenant) throw new I18nNotFoundException('errors.tenant.notFound');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: dto as any,
    });
  }

  /** Owner-facing: fetch the caller's own tenant. */
  getOwn(tenantId: string) {
    return this.findOne(tenantId);
  }

  /** Owner-facing: update a whitelisted subset of the caller's own tenant. */
  async updateOwn(tenantId: string, dto: UpdateOwnTenantDto) {
    await this.findOne(tenantId);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto as any,
      include: { subscriptionPlan: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
