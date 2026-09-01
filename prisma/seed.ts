/**
 * Seed script — creates the platform super admin and the base subscription
 * plans ("Oddiy" monthly / yearly) with unlimited limits.
 *
 * Run with: npm run db:seed
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Fixed ids so this script can be re-run safely (upsert instead of duplicating rows).
const PLAN_MONTHLY_ID = '00000000-0000-0000-0000-000000000101';
const PLAN_YEARLY_ID = '00000000-0000-0000-0000-000000000102';

const SUPER_ADMIN_PHONE = '+998888001738';
const SUPER_ADMIN_PASSWORD = 'Jackyshow98';

const UNLIMITED_FEATURES = {
  analytics: true,
  export: true,
  multiBranch: true,
  multiUser: true,
  inventory: true,
  reports: true,
  telegramBot: true,
  clientDebt: true,
  supplierDebt: true,
  prioritySupport: true,
};

// Prisma's Int columns cap out well below Number.MAX_SAFE_INTEGER; this is
// effectively "no limit" for maxBranches / maxUsers / maxProducts.
const UNLIMITED = 1_000_000;

async function seedSubscriptionPlans() {
  const base = {
    features: UNLIMITED_FEATURES,
    maxBranches: UNLIMITED,
    maxUsers: UNLIMITED,
    maxProducts: UNLIMITED,
    isActive: true,
  };

  await prisma.subscriptionPlan.upsert({
    where: { id: PLAN_MONTHLY_ID },
    update: {
      name: 'Oddiy (oylik)',
      description: 'Oddiy tarif — oylik to‘lov, cheklovsiz imkoniyatlar',
      price: 100_000,
      durationDays: 30,
      ...base,
    },
    create: {
      id: PLAN_MONTHLY_ID,
      name: 'Oddiy (oylik)',
      description: 'Oddiy tarif — oylik to‘lov, cheklovsiz imkoniyatlar',
      price: 100_000,
      durationDays: 30,
      ...base,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { id: PLAN_YEARLY_ID },
    update: {
      name: 'Oddiy (yillik)',
      description: 'Oddiy tarif — yillik to‘lov, cheklovsiz imkoniyatlar',
      price: 1_000_000,
      durationDays: 365,
      ...base,
    },
    create: {
      id: PLAN_YEARLY_ID,
      name: 'Oddiy (yillik)',
      description: 'Oddiy tarif — yillik to‘lov, cheklovsiz imkoniyatlar',
      price: 1_000_000,
      durationDays: 365,
      ...base,
    },
  });

  console.log('✔ Subscription plans seeded: Oddiy (oylik), Oddiy (yillik)');
}

async function seedSuperAdmin() {
  // Platform admins aren't tied to a tenant, so the (phone, tenantId) unique
  // index doesn't help here — look them up by phone + null tenant instead.
  const existing = await prisma.user.findFirst({
    where: { phone: SUPER_ADMIN_PHONE, tenantId: null },
  });

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: UserRole.super_admin,
        isActive: true,
      },
    });
    console.log(`✔ Super admin updated (${SUPER_ADMIN_PHONE})`);
  } else {
    await prisma.user.create({
      data: {
        phone: SUPER_ADMIN_PHONE,
        passwordHash,
        role: UserRole.super_admin,
        fullName: 'Super Admin',
        language: 'uz',
        tenantId: null,
        branchId: null,
      },
    });
    console.log(`✔ Super admin created (${SUPER_ADMIN_PHONE})`);
  }
}

async function main() {
  await seedSubscriptionPlans();
  await seedSuperAdmin();
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
