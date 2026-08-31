import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { I18nController } from './i18n.controller';
import { I18nExceptionFilter } from './i18n.filter';
import { I18nService } from './i18n.service';

/**
 * Global localisation. Provides {@link I18nService} everywhere and registers the
 * {@link I18nExceptionFilter} so every HTTP error is returned in the caller's
 * language.
 */
@Global()
@Module({
  controllers: [I18nController],
  providers: [
    I18nService,
    { provide: APP_FILTER, useClass: I18nExceptionFilter },
  ],
  exports: [I18nService],
})
export class I18nModule {}
