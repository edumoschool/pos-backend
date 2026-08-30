import { BadRequestException, NotFoundException } from '@nestjs/common';

// NotificationsService pulls in expo-server-sdk, which ships ESM and cannot be
// required by ts-jest. The collaborator is stubbed here anyway, so the module
// is mocked to keep this a pure unit test of the sale logic.
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

import { Prisma } from '../generated/prisma/client';
import { SalesService } from './sales.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const CLIENT = '44444444-4444-4444-4444-444444444444';
const PRODUCT = '55555555-5555-5555-5555-555555555555';
const INVENTORY = '66666666-6666-6666-6666-666666666666';

function baseProduct(sellingPrice = 1000, costPrice = 600, stock = 10) {
  return {
    id: PRODUCT,
    name: 'LED Bulb 12W',
    tenantId: TENANT,
    isActive: true,
    sellingPrice: new Prisma.Decimal(sellingPrice),
    costPrice: new Prisma.Decimal(costPrice),
    inventory: [
      {
        id: INVENTORY,
        tenantId: TENANT,
        quantity: new Prisma.Decimal(stock),
        costPrice: new Prisma.Decimal(costPrice),
      },
    ],
  };
}

// Mimics the slice of Prisma the sale path touches. `stock` is mutable so the
// guarded decrement can be exercised the way the database would enforce it.
function makeTx(
  opts: { stock?: number; sellingPrice?: number; costPrice?: number } = {},
) {
  const stock = opts.stock ?? 10;
  const state = { stock };
  const created: any = { sales: [], movements: [], clientTransactions: [] };

  const tx = {
    product: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          baseProduct(opts.sellingPrice ?? 1000, opts.costPrice ?? 600, stock),
        ]),
    },
    inventory: {
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        const need = Number(where.quantity.gte);
        if (state.stock < need) return Promise.resolve({ count: 0 });
        state.stock -= Number(data.quantity.decrement);
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ quantity: new Prisma.Decimal(state.stock) }),
        ),
    },
    inventoryMovement: {
      create: jest.fn().mockImplementation(({ data }: any) => {
        created.movements.push(data);
        return Promise.resolve(data);
      }),
    },
    sale: {
      create: jest.fn().mockImplementation(({ data }: any) => {
        const sale = {
          ...data,
          id: 'sale-1',
          createdAt: new Date(),
          items: data.items.create,
        };
        created.sales.push(sale);
        return Promise.resolve(sale);
      }),
    },
    clientTransaction: {
      create: jest.fn().mockImplementation(({ data }: any) => {
        created.clientTransactions.push(data);
        return Promise.resolve(data);
      }),
    },
  };

  return { tx, state, created };
}

function makeService(tx: any) {
  const prisma: any = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    inventory: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const notifications: any = { create: jest.fn().mockResolvedValue(undefined) };
  return new SalesService(prisma, notifications, undefined as any);
}

describe('SalesService.create', () => {
  it('decrements stock and records a movement for a cash sale', async () => {
    const { tx, state, created } = makeTx({ stock: 10, sellingPrice: 1000 });
    const service = makeService(tx);

    await service.create(TENANT, USER, {
      items: [{ productId: PRODUCT, quantity: 2 }],
      paymentMethod: 'cash',
      paidAmount: 2000,
    } as any);

    expect(state.stock).toBe(8);
    expect(created.movements).toHaveLength(1);
    expect(created.movements[0].type).toBe('out');
    expect(Number(created.movements[0].before)).toBe(10);
    expect(Number(created.movements[0].after)).toBe(8);
  });

  it('computes totals and debt without float drift', async () => {
    const { tx, created } = makeTx({ stock: 100, sellingPrice: 0.1 });
    const service = makeService(tx);

    // 0.1 * 3 is 0.30000000000000004 in float64; Decimal keeps it exact.
    await service.create(TENANT, USER, {
      items: [{ productId: PRODUCT, quantity: 3 }],
      paymentMethod: 'cash',
      paidAmount: 0,
      clientId: CLIENT,
    } as any);

    const sale = created.sales[0];
    expect(new Prisma.Decimal(sale.totalAmount).toFixed(2)).toBe('0.30');
    expect(new Prisma.Decimal(sale.debtAmount).toFixed(2)).toBe('0.30');
  });

  it('marks the sale as debt and writes a client transaction on partial payment', async () => {
    const { tx, created } = makeTx({ stock: 10, sellingPrice: 1000 });
    const service = makeService(tx);

    await service.create(TENANT, USER, {
      items: [{ productId: PRODUCT, quantity: 2 }],
      paymentMethod: 'cash',
      paidAmount: 500,
      clientId: CLIENT,
    } as any);

    const sale = created.sales[0];
    expect(sale.status).toBe('debt');
    expect(Number(sale.debtAmount)).toBe(1500);
    expect(created.clientTransactions).toHaveLength(1);
    expect(Number(created.clientTransactions[0].amount)).toBe(1500);
  });

  it('marks the sale completed and writes no debt row when fully paid', async () => {
    const { tx, created } = makeTx({ stock: 10, sellingPrice: 1000 });
    const service = makeService(tx);

    await service.create(TENANT, USER, {
      items: [{ productId: PRODUCT, quantity: 2 }],
      paymentMethod: 'cash',
      paidAmount: 2000,
      clientId: CLIENT,
    } as any);

    expect(created.sales[0].status).toBe('completed');
    expect(created.clientTransactions).toHaveLength(0);
  });

  it('applies a flat discount to the total', async () => {
    const { tx, created } = makeTx({ stock: 10, sellingPrice: 1000 });
    const service = makeService(tx);

    await service.create(TENANT, USER, {
      items: [{ productId: PRODUCT, quantity: 2 }],
      paymentMethod: 'cash',
      paidAmount: 1800,
      discount: 200,
    } as any);

    expect(Number(created.sales[0].totalAmount)).toBe(1800);
    expect(Number(created.sales[0].debtAmount)).toBe(0);
  });

  it('snapshots the cost price onto the sale item', async () => {
    const { tx, created } = makeTx({
      stock: 10,
      sellingPrice: 1000,
      costPrice: 600,
    });
    const service = makeService(tx);

    await service.create(TENANT, USER, {
      items: [{ productId: PRODUCT, quantity: 1 }],
      paymentMethod: 'cash',
      paidAmount: 1000,
    } as any);

    expect(Number(created.sales[0].items[0].costPrice)).toBe(600);
  });

  it('rejects a sale that exceeds available stock', async () => {
    const { tx, state } = makeTx({ stock: 1 });
    const service = makeService(tx);

    await expect(
      service.create(TENANT, USER, {
        items: [{ productId: PRODUCT, quantity: 5 }],
        paymentMethod: 'cash',
        paidAmount: 5000,
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(state.stock).toBe(1);
  });

  it('rejects a concurrent sale that loses the race for the last unit', async () => {
    const { tx, state } = makeTx({ stock: 1 });
    const service = makeService(tx);

    // A competing sale commits between the read and the decrement: validation
    // sees stock 1, but the guarded update then finds nothing left.
    tx.product.findMany.mockImplementation(async () => {
      const snapshot = [baseProduct(1000, 600, 1)];
      state.stock = 0;
      return snapshot;
    });

    await expect(
      service.create(TENANT, USER, {
        items: [{ productId: PRODUCT, quantity: 1 }],
        paymentMethod: 'cash',
        paidAmount: 1000,
      } as any),
    ).rejects.toThrow(/concurrently/);

    expect(state.stock).toBe(0);
  });

  it('rejects a debt sale with no client attached', async () => {
    const { tx } = makeTx({ stock: 10, sellingPrice: 1000 });
    const service = makeService(tx);

    await expect(
      service.create(TENANT, USER, {
        items: [{ productId: PRODUCT, quantity: 2 }],
        paymentMethod: 'cash',
        paidAmount: 500,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects payment greater than the total', async () => {
    const { tx } = makeTx({ stock: 10, sellingPrice: 1000 });
    const service = makeService(tx);

    await expect(
      service.create(TENANT, USER, {
        items: [{ productId: PRODUCT, quantity: 1 }],
        paymentMethod: 'cash',
        paidAmount: 99999,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('scopes the product lookup to the caller tenant', async () => {
    const { tx } = makeTx({ stock: 10 });
    tx.product.findMany.mockResolvedValue([]);
    const service = makeService(tx);

    await expect(
      service.create(OTHER_TENANT, USER, {
        items: [{ productId: PRODUCT, quantity: 1 }],
        paymentMethod: 'cash',
        paidAmount: 1000,
      } as any),
    ).rejects.toThrow(NotFoundException);

    expect(tx.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: OTHER_TENANT }),
      }),
    );
  });
});
