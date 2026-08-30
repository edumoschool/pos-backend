import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SseService } from './sse.service';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private sseService: SseService,
  ) {}

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const basicPlan = await this.prisma.subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.tenantName,
        ownerPhone: dto.phone,
        language: (dto.language as any) ?? 'en',
        subscriptionPlanId: basicPlan?.id,
        subscriptionStatus: 'trial',
        subscriptionStart: now,
        subscriptionEnd: trialEnd,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        role: 'owner',
        tenantId: tenant.id,
        language: (dto.language as any) ?? 'en',
      },
    });

    const tokens = await this.generateTokens(user, ip, userAgent);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user, ip, userAgent);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true, branch: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.sanitizeUser(user);
  }

  async logout(sessionId: string) {
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    this.sseService.emitSessionRevoked(session.userId, sessionId);
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
    this.sseService.emitAllSessionsRevoked(userId);
    return { message: 'All sessions revoked successfully' };
  }

  async getActiveSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, isRevoked: false },
    });
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    this.sseService.emitSessionRevoked(userId, sessionId);
    return { message: 'Session revoked successfully' };
  }

  private async generateTokens(user: any, ip?: string, userAgent?: string) {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    const expiresAt = this.calculateExpiry(expiresIn);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
    });

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        ipAddress: ip,
        userAgent: userAgent,
        expiresAt,
      },
    });

    const tokenWithSession = await this.jwtService.signAsync({
      sub: user.id,
      phone: user.phone,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
      sessionId: session.id,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: { token: tokenWithSession },
    });

    return { accessToken: tokenWithSession };
  }

  private calculateExpiry(expiresIn: string): Date {
    const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...result } = user;
    return result;
  }
}
