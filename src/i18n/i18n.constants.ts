export const SUPPORTED_LOCALES = ['en', 'uz', 'ru'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

/**
 * Normalise anything that might carry a language preference into a supported
 * locale. Accepts a bare code (`"uz"`), a BCP-47 tag (`"ru-RU"`) or a full
 * `Accept-Language` header (`"ru-RU,ru;q=0.9,en;q=0.8"`). Falls back to the
 * default locale when nothing matches.
 */
export function resolveLocale(input?: string | null): Locale {
  if (!input) return DEFAULT_LOCALE;

  for (const part of String(input).split(',')) {
    const code = part.trim().split(';')[0].trim().slice(0, 2).toLowerCase();
    if (LOCALE_SET.has(code)) return code as Locale;
  }

  return DEFAULT_LOCALE;
}
