import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, Locale, resolveLocale } from './i18n.constants';
import { en, TranslationCatalog } from './translations/en';
import { ru } from './translations/ru';
import { uz } from './translations/uz';

export type TranslateArgs = Record<string, string | number | null | undefined>;

@Injectable()
export class I18nService {
  private readonly catalogs: Record<Locale, TranslationCatalog> = { en, uz, ru };

  /**
   * Look a dotted key up in the caller's locale, falling back to the default
   * locale and finally to the key itself. Placeholders (`{name}`) are filled
   * from `args`.
   */
  translate(key: string, lang?: string | null, args?: TranslateArgs): string {
    const locale = resolveLocale(lang);

    const template =
      this.lookup(this.catalogs[locale], key) ??
      this.lookup(this.catalogs[DEFAULT_LOCALE], key) ??
      key;

    return this.interpolate(template, args);
  }

  /** Short alias. */
  t(key: string, lang?: string | null, args?: TranslateArgs): string {
    return this.translate(key, lang, args);
  }

  /** The whole catalogue for a locale — used by the public /i18n/:lang endpoint. */
  getCatalog(lang?: string | null): TranslationCatalog {
    return this.catalogs[resolveLocale(lang)];
  }

  private lookup(source: unknown, path: string): string | undefined {
    let node: any = source;
    for (const segment of path.split('.')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[segment];
    }
    return typeof node === 'string' ? node : undefined;
  }

  private interpolate(template: string, args?: TranslateArgs): string {
    if (!args) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in args && args[name] != null ? String(args[name]) : match,
    );
  }
}
