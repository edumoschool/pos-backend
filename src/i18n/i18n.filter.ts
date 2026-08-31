import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DEFAULT_LOCALE, resolveLocale } from './i18n.constants';
import { isI18nError } from './i18n.exception';
import { I18nService } from './i18n.service';

const STATUS_LABEL: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * Localises every HTTP error the API returns.
 *
 * - {@link I18nException}s carry a translation key, resolved here against the
 *   caller's language (JWT user → `Accept-Language` header → default).
 * - Framework exceptions whose message is itself a dotted key are translated.
 * - Bare framework messages ("Unauthorized", "Forbidden resource", …) are
 *   swapped for the localised `errors.common.*` equivalents.
 * - `class-validator` arrays are passed through unchanged (field-level text).
 */
@Catch(HttpException)
export class I18nExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18n: I18nService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { language?: string | null } }>();

    const lang = resolveLocale(
      req.user?.language ?? (req.headers['accept-language'] as string | undefined),
    );

    const status = exception.getStatus();
    let message: string | string[];
    let error = STATUS_LABEL[status] ?? 'Error';

    if (isI18nError(exception)) {
      message = this.i18n.translate(exception.i18nKey, lang, exception.i18nArgs);
    } else {
      const raw = exception.getResponse();

      if (typeof raw === 'string') {
        message = this.localiseText(raw, status, lang);
      } else if (raw && typeof raw === 'object') {
        const body = raw as { message?: unknown; error?: string };
        error = body.error ?? error;
        message = Array.isArray(body.message)
          ? (body.message as string[])
          : this.localiseText(
              typeof body.message === 'string' ? body.message : error,
              status,
              lang,
            );
      } else {
        message = this.localiseText(error, status, lang);
      }
    }

    res.status(status).json({ statusCode: status, message, error, lang });
  }

  /** Translate dotted keys and known bare framework strings; leave the rest. */
  private localiseText(text: string, status: number, lang: string): string {
    if (/^[a-z][a-z0-9_]*(\.[a-z0-9_-]+)+$/i.test(text)) {
      return this.i18n.translate(text, lang);
    }

    const bareMap: Record<string, string> = {
      Unauthorized: 'errors.common.unauthorized',
      'Forbidden resource': 'errors.common.forbidden',
      Forbidden: 'errors.common.forbidden',
      'Not Found': 'errors.common.notFound',
      'Bad Request': 'errors.common.badRequest',
      'Internal server error': 'errors.common.internal',
      'ThrottlerException: Too Many Requests': 'errors.common.tooManyRequests',
    };
    if (bareMap[text]) return this.i18n.translate(bareMap[text], lang);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      return this.i18n.translate('errors.common.internal', lang);
    }
    return text;
  }
}

export const I18N_DEFAULT_LOCALE = DEFAULT_LOCALE;
