import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Locale, resolveLocale } from './i18n.constants';

/**
 * Injects the caller's resolved locale into a handler:
 *
 *   exportReport(@Lang() lang: Locale, ...) { ... }
 *
 * Resolution order: authenticated user's `language` → `Accept-Language`
 * header → default locale.
 */
export const Lang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Locale => {
    const req = ctx.switchToHttp().getRequest();
    return resolveLocale(
      req.user?.language ?? req.headers?.['accept-language'],
    );
  },
);
