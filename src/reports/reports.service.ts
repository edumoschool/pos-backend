import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { TransactionType } from '../generated/prisma/client';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private exchangeRatesService: ExchangeRatesService,
  ) {}

  // ─── Financial transactions summary (income / expense) ───────────

  async financialSummary(tenantId: string, branchId?: string, from?: string, to?: string) {
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const transactions = await this.prisma.transaction.findMany({ where });
    const { usdToUzs } = await this.exchangeRatesService.getLatest();

    let incomeUzs = 0;
    let incomeUsd = 0;
    let expensesUzs = 0;
    let expensesUsd = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      if (tx.type === TransactionType.income) {
        if (tx.currency === 'UZS') incomeUzs += amount;
        else incomeUsd += amount;
      } else {
        if (tx.currency === 'UZS') expensesUzs += amount;
        else expensesUsd += amount;
      }
    }

    const totalIncome = incomeUzs + incomeUsd * usdToUzs;
    const totalExpenses = expensesUzs + expensesUsd * usdToUzs;

    return {
      totalIncome: +totalIncome.toFixed(2),
      totalExpenses: +totalExpenses.toFixed(2),
      netProfit: +(totalIncome - totalExpenses).toFixed(2),
      transactionCount: transactions.length,
    };
  }

  // ─── Transactions by day ─────────────────────────────────────────

  async transactionsByDay(tenantId: string, branchId?: string, from?: string, to?: string) {
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const grouped: Record<string, { income: number; expenses: number; count: number }> = {};
    for (const tx of transactions) {
      const day = tx.createdAt.toISOString().slice(0, 10);
      if (!grouped[day]) grouped[day] = { income: 0, expenses: 0, count: 0 };
      grouped[day].count++;
      if (tx.type === TransactionType.income) grouped[day].income += Number(tx.amount);
      else grouped[day].expenses += Number(tx.amount);
    }

    return Object.entries(grouped).map(([date, d]) => ({
      date,
      count: d.count,
      income: +d.income.toFixed(2),
      expenses: +d.expenses.toFixed(2),
      net: +(d.income - d.expenses).toFixed(2),
    }));
  }

  // ─── Expenses by category ────────────────────────────────────────

  async expensesByCategory(tenantId: string, branchId?: string, from?: string, to?: string) {
    const where: any = { tenantId, type: TransactionType.expense };
    if (branchId) where.branchId = branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: { expenseCategory: { select: { id: true, name: true } } },
    });

    const categoryMap: Record<string, { category: any; total: number; count: number }> = {};
    for (const tx of transactions) {
      const key = tx.expenseCategoryId || 'uncategorized';
      if (!categoryMap[key])
        categoryMap[key] = {
          category: tx.expenseCategory || { id: null, name: 'Uncategorized' },
          total: 0,
          count: 0,
        };
      categoryMap[key].total += Number(tx.amount);
      categoryMap[key].count++;
    }

    return Object.values(categoryMap)
      .sort((a, b) => b.total - a.total)
      .map((c) => ({
        ...c.category,
        totalAmount: +c.total.toFixed(2),
        transactionCount: c.count,
      }));
  }

  // ─── Income by category ──────────────────────────────────────────

  async incomeByCategory(tenantId: string, branchId?: string, from?: string, to?: string) {
    const where: any = { tenantId, type: TransactionType.income };
    if (branchId) where.branchId = branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: { incomeCategory: { select: { id: true, name: true } } },
    });

    const categoryMap: Record<string, { category: any; total: number; count: number }> = {};
    for (const tx of transactions) {
      const key = tx.incomeCategoryId || 'uncategorized';
      if (!categoryMap[key])
        categoryMap[key] = {
          category: tx.incomeCategory || { id: null, name: 'Uncategorized' },
          total: 0,
          count: 0,
        };
      categoryMap[key].total += Number(tx.amount);
      categoryMap[key].count++;
    }

    return Object.values(categoryMap)
      .sort((a, b) => b.total - a.total)
      .map((c) => ({
        ...c.category,
        totalAmount: +c.total.toFixed(2),
        transactionCount: c.count,
      }));
  }

  // ─── Inventory report ────────────────────────────────────────────

  async inventoryReport(tenantId: string) {
    const items = await this.prisma.inventory.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, costPrice: true, sellingPrice: true, currency: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { quantity: 'asc' },
    });

    const totalItems = items.length;
    const totalStockValue = items.reduce(
      (sum, i) => sum + Number(i.quantity) * Number(i.costPrice || i.product.costPrice),
      0,
    );
    const lowStockItems = items.filter(
      (i) => i.minQuantity !== null && Number(i.quantity) <= Number(i.minQuantity),
    );

    return {
      totalItems,
      totalStockValue: +totalStockValue.toFixed(2),
      lowStockCount: lowStockItems.length,
      items: items.map((i) => ({
        inventoryId: i.id,
        product: i.product,
        supplier: i.supplier,
        quantity: Number(i.quantity),
        minQuantity: i.minQuantity ? Number(i.minQuantity) : null,
        maxQuantity: i.maxQuantity ? Number(i.maxQuantity) : null,
        costPrice: Number(i.costPrice),
        costCurrency: i.costCurrency,
        location: i.location,
        isLowStock: i.minQuantity !== null && Number(i.quantity) <= Number(i.minQuantity),
        stockValue: +(Number(i.quantity) * Number(i.costPrice)).toFixed(2),
      })),
    };
  }

  // ─── Client balances summary ─────────────────────────────────────

  async clientBalances(tenantId: string) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId },
      include: { clientTransactions: true },
    });

    const { usdToUzs } = await this.exchangeRatesService.getLatest();

    return clients.map((client) => {
      let balanceUzs = 0;
      let balanceUsd = 0;
      for (const tx of client.clientTransactions) {
        const sign = tx.type === 'income' ? 1 : -1;
        if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
        else balanceUsd += sign * Number(tx.amount);
      }
      const totalUzs = balanceUzs + balanceUsd * usdToUzs;
      return {
        id: client.id,
        fullName: client.fullName,
        phone: client.phone,
        balanceUzs: +balanceUzs.toFixed(2),
        balanceUsd: +balanceUsd.toFixed(6),
        totalAmount: +totalUzs.toFixed(2),
        transactionCount: client.clientTransactions.length,
      };
    });
  }

  // ─── Supplier balances summary ───────────────────────────────────

  async supplierBalances(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, isActive: true },
      include: { supplierTransactions: true },
    });

    const { usdToUzs } = await this.exchangeRatesService.getLatest();

    return suppliers.map((supplier) => {
      let balanceUzs = 0;
      let balanceUsd = 0;
      for (const tx of supplier.supplierTransactions) {
        const sign = tx.type === 'income' ? 1 : -1;
        if (tx.currency === 'UZS') balanceUzs += sign * Number(tx.amount);
        else balanceUsd += sign * Number(tx.amount);
      }
      const totalUzs = balanceUzs + balanceUsd * usdToUzs;
      return {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        balanceUzs: +balanceUzs.toFixed(2),
        balanceUsd: +balanceUsd.toFixed(6),
        totalAmount: +totalUzs.toFixed(2),
        transactionCount: supplier.supplierTransactions.length,
      };
    });
  }

  // ─── Keep backward-compat alias used by telegram service ─────────
  /** @deprecated use financialSummary */
  async salesSummary(tenantId: string, branchId?: string, from?: string, to?: string) {
    return this.financialSummary(tenantId, branchId, from, to);
  }

  /** @deprecated use financialSummary */
  async topProducts(tenantId: string, _branchId?: string, _limit = 10) {
    return this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      include: { inventory: { select: { quantity: true } } },
      orderBy: { name: 'asc' },
      take: _limit,
    });
  }

  /** @deprecated no longer meaningful without sales */
  async topSellers(tenantId: string, _branchId?: string, _from?: string, _to?: string) {
    return this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, fullName: true, phone: true, role: true },
    });
  }
}
