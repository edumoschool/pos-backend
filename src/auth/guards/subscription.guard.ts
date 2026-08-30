import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.tenantId) {
      return true;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { subscriptionStatus: true, subscriptionEnd: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    if (tenant.subscriptionStatus === 'cancelled') {
      throw new ForbiddenException('Subscription has been cancelled');
    }

    if (tenant.subscriptionStatus === 'expired') {
      throw new ForbiddenException('Subscription has expired');
    }

    if (tenant.subscriptionEnd && new Date() > tenant.subscriptionEnd) {
      await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: { subscriptionStatus: 'expired' },
      });
      throw new ForbiddenException('Subscription has expired');
    }

    return true;
  }
}
