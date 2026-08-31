import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale } from './i18n.constants';
import { I18nService } from './i18n.service';

@ApiTags('i18n')
@Controller('i18n')
export class I18nController {
  constructor(private readonly i18n: I18nService) {}

  @Public()
  @Get('locales')
  @ApiOperation({ summary: 'List supported locales and the default' })
  locales() {
    return { locales: SUPPORTED_LOCALES, default: DEFAULT_LOCALE };
  }

  @Public()
  @Get(':lang')
  @ApiOperation({ summary: 'Full server-side message catalogue for a locale' })
  catalog(@Param('lang') lang: string) {
    const locale = resolveLocale(lang);
    return { lang: locale, translations: this.i18n.getCatalog(locale) };
  }
}
