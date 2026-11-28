import type { Translate } from '@/domain/translate'
import type { ApiError } from './problem'

/** User-facing message per error type, in the current language. */
export function describeError(error: ApiError, t: Translate): string {
  switch (error.type) {
    case 'invalid_credentials':
    case 'email_not_verified':
    case 'invalid_code':
    case 'two_factor_restart':
    case 'token_invalid':
    case 'password_confirmation_failed':
    case 'panel_name_conflict':
    case 'panel_version_conflict':
    case 'panel_not_in_trash':
    case 'panel_content_id_conflict':
    case 'validation':
    case 'network':
      return t(`errors.api.${error.type}`)
    case 'rate_limited':
      return error.retryAfter === null
        ? t('errors.api.rate_limited')
        : t('errors.api.rate_limited_after', { seconds: error.retryAfter })
    default:
      return t('errors.api.default')
  }
}
