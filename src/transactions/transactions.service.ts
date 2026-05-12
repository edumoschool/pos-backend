import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, UpdateTransactionDto } from './dto';

const INCLUDE = {
  expenseCategory: true,
  incomeCategory: true,
  user: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  create(tenantId: string, userId: string, dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        tenantId,
        userId,
        branchId: dto.branchId,
        type: dto.type as any,
        amount: dto.amount,
        currency: (dto as any).currency,
        expenseCategoryId: dto.expenseCategoryId,
        incomeCategoryId: (dto as any).incomeCategoryId,
        description: dto.description,
      },
      include: INCLUDE,
    });
  }

  findAll(tenantId: string, branchId?: string, type?: string) {
    return this.prisma.transaction.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        ...(type && { type: type as any }),
      },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, tenantId },
      include: INCLUDE,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async update(id: string, tenantId: string, dto: UpdateTransactionDto) {
    await this.findOne(id, tenantId);
    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.branchId && { branchId: dto.branchId }),
        ...(dto.type && { type: dto.type as any }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...((dto as any).currency !== undefined && { currency: (dto as any).currency }),
        ...(dto.expenseCategoryId !== undefined && { expenseCategoryId: dto.expenseCategoryId }),
        ...((dto as any).incomeCategoryId !== undefined && { incomeCategoryId: (dto as any).incomeCategoryId }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: INCLUDE,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.transaction.delete({ where: { id } });
  }
}
