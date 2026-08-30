import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SseService } from '../auth/sse.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import * as bcrypt from 'bcrypt';
import { paginateParams, paginated } from '../common/helpers/paginate';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private sseService: SseService,
  ) {}

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone, tenantId },
    });
    if (existing) {
      throw new ConflictException('User with this phone already exists in tenant');
    }

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        ...rest,
        passwordHash,
        tenantId,
        role: (dto.role as any) ?? 'seller',
        language: (dto.language as any) ?? 'en',
      },
      select: {
        id: true, phone: true, fullName: true, role: true,
        branchId: true, language: true, isActive: true, createdAt: true,
      },
    });
  }

  async findAll(tenantId: string, role?: string, page = 1, limit = 20) {
    const { skip, take, page: p, limit: l } = paginateParams(page, limit);
    const where = { tenantId, ...(role && { role: role as any }) };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, phone: true, fullName: true, role: true,
          branchId: true, language: true, isActive: true, createdAt: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data, total, p, l);
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: {
        id: true, phone: true, fullName: true, role: true,
        branchId: true, language: true, isActive: true, createdAt: true, updatedAt: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, tenantId: string, dto: UpdateUserDto) {
    await this.findOne(id, tenantId);

    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }
    if (dto.role) data.role = dto.role as any;
    if (dto.language) data.language = dto.language as any;

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, phone: true, fullName: true, role: true,
        branchId: true, language: true, isActive: true, updatedAt: true,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    this.sseService.emitUserDeactivated(id);
    return user;
  }

  async changeLanguage(userId: string, language: 'en' | 'uz' | 'ru') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { language: language as any },
      select: {
        id: true, fullName: true, language: true,
      },
    });
  }
}
