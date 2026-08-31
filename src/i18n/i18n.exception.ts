import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TranslateArgs } from './i18n.service';

/**
 * Framework exceptions that carry a *translation key* instead of a finished
 * message. The global {@link I18nExceptionFilter} swaps the key for text in the
 * caller's language when the response is written.
 *
 * Each subclass extends the matching Nest exception, so existing
 * `instanceof BadRequestException` / `NotFoundException` checks (and tests)
 * keep working.
 */
export interface I18nErrorPayload {
  /** Dotted catalogue key, e.g. `errors.sale.insufficientStock`. */
  readonly i18nKey: string;
  readonly i18nArgs?: TranslateArgs;
}

/** Structural check used by the filter instead of a brittle `instanceof`. */
export function isI18nError(e: unknown): e is HttpException & I18nErrorPayload {
  return e instanceof HttpException && typeof (e as any).i18nKey === 'string';
}

/** Generic — use when you need a non-standard status. */
export class I18nException extends HttpException implements I18nErrorPayload {
  constructor(
    public readonly i18nKey: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly i18nArgs?: TranslateArgs,
  ) {
    super(i18nKey, status);
  }
}

export class I18nBadRequestException
  extends BadRequestException
  implements I18nErrorPayload
{
  constructor(
    public readonly i18nKey: string,
    public readonly i18nArgs?: TranslateArgs,
  ) {
    super(i18nKey);
  }
}

export class I18nUnauthorizedException
  extends UnauthorizedException
  implements I18nErrorPayload
{
  constructor(
    public readonly i18nKey = 'errors.common.unauthorized',
    public readonly i18nArgs?: TranslateArgs,
  ) {
    super(i18nKey);
  }
}

export class I18nForbiddenException
  extends ForbiddenException
  implements I18nErrorPayload
{
  constructor(
    public readonly i18nKey = 'errors.common.forbidden',
    public readonly i18nArgs?: TranslateArgs,
  ) {
    super(i18nKey);
  }
}

export class I18nNotFoundException
  extends NotFoundException
  implements I18nErrorPayload
{
  constructor(
    public readonly i18nKey = 'errors.common.notFound',
    public readonly i18nArgs?: TranslateArgs,
  ) {
    super(i18nKey);
  }
}

export class I18nConflictException
  extends ConflictException
  implements I18nErrorPayload
{
  constructor(
    public readonly i18nKey: string,
    public readonly i18nArgs?: TranslateArgs,
  ) {
    super(i18nKey);
  }
}
