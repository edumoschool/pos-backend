import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { TenantsModule } from './tenants/tenants.module';
import { BranchesModule } from './branches/branches.module';
import { UsersModule } from './users/users.module';
import { UnitsModule } from './units/units.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ClientsModule } from './clients/clients.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReportsModule } from './reports/reports.module';
import { DebtsModule } from './debts/debts.module';
import { MinioModule } from './minio/minio.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JwtAuthGuard, RolesGuard, SubscriptionGuard } from './auth/guards';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 60 }] }),
    PrismaModule,
    AuthModule,
    SubscriptionPlansModule,
    TenantsModule,
    BranchesModule,
    UsersModule,
    UnitsModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    ClientsModule,
    SalesModule,
    PaymentsModule,
    ExpenseCategoriesModule,
    TransactionsModule,
    ReportsModule,
    DebtsModule,
    MinioModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
