import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
        const isProduction = config.get('NODE_ENV') === 'production';
        const webhookDomain = config.get<string>('TELEGRAM_WEBHOOK_DOMAIN');

        if (isProduction && webhookDomain) {
          return {
            token,
            launchOptions: {
              webhook: {
                domain: webhookDomain,
                path: '/telegram-webhook',
              },
            },
          };
        }

        return { token };
      },
    }),
    PrismaModule,
  ],
  providers: [TelegramService, TelegramUpdate],
  exports: [TelegramService],
})
export class TelegramModule {}
