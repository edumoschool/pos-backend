import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('POS System API')
    .setDescription('Point of Sale backend API with multi-tenant support')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Telegram webhook setup for production
  if (process.env.NODE_ENV === 'production' && process.env.TELEGRAM_WEBHOOK_DOMAIN) {
    const bot = app.get<Telegraf>(getBotToken());
    app.use(bot.webhookCallback('/telegram-webhook'));
  }

  await app.listen(process.env.PORT ?? 7000);
}
bootstrap();
