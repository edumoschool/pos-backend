import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Expo, { ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private expo: Expo;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    this.expo = new Expo({ accessToken });
  }

  async registerToken(userId: string, token: string): Promise<void> {
    if (!Expo.isExpoPushToken(token)) {
      throw new Error(`Invalid Expo push token: ${token}`);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token },
    });
  }

  async removeToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: null },
    });
  }

  async sendToUser(userId: string, notification: Omit<SendNotificationDto, 'to'>): Promise<ExpoPushTicket[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) {
      this.logger.warn(`No push token found for user ${userId}`);
      return [];
    }

    return this.send({ ...notification, to: user.expoPushToken });
  }

  async sendToTenant(tenantId: string, notification: Omit<SendNotificationDto, 'to'>): Promise<ExpoPushTicket[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, expoPushToken: { not: null } },
      select: { expoPushToken: true },
    });

    const tokens = users
      .map((u) => u.expoPushToken)
      .filter((t): t is string => !!t);

    if (tokens.length === 0) {
      this.logger.warn(`No push tokens found for tenant ${tenantId}`);
      return [];
    }

    return this.send({ ...notification, to: tokens });
  }

  async send(dto: SendNotificationDto): Promise<ExpoPushTicket[]> {
    const tokens = Array.isArray(dto.to) ? dto.to : [dto.to];

    const validTokens = tokens.filter((token) => {
      if (!Expo.isExpoPushToken(token)) {
        this.logger.warn(`Skipping invalid Expo push token: ${token}`);
        return false;
      }
      return true;
    });

    if (validTokens.length === 0) {
      return [];
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      title: dto.title,
      body: dto.body,
      data: dto.data,
      priority: dto.priority,
      ttl: dto.ttl,
      sound: dto.sound ?? 'default',
      badge: dto.badge,
      channelId: dto.channelId,
      subtitle: dto.subtitle,
      categoryId: dto.categoryId,
      mutableContent: dto.mutableContent,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        this.logger.error('Failed to send push notification chunk', error);
      }
    }

    // Log any ticket-level errors
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        this.logger.error(`Push ticket error: ${ticket.message}`, ticket.details);
      }
    }

    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    const chunks = this.expo.chunkPushNotificationReceiptIds(ticketIds);
    const allReceipts: Record<string, ExpoPushReceipt> = {};

    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);

        for (const [id, receipt] of Object.entries(receipts)) {
          allReceipts[id] = receipt;
          if (receipt.status === 'error') {
            this.logger.error(`Push receipt error for ${id}: ${receipt.message}`, receipt.details);
          }
        }
      } catch (error) {
        this.logger.error('Failed to get push notification receipts', error);
      }
    }

    return allReceipts;
  }
}
