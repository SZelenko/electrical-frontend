import type { ApiError } from './problem'

/** Ukrainian user-facing message per error type. */
export function describeError(error: ApiError): string {
  switch (error.type) {
    case 'invalid_credentials':
      return 'Невірна електронна пошта або пароль.'
    case 'email_not_verified':
      return 'Електронну пошту не підтверджено.'
    case 'invalid_code':
      return 'Невірний або прострочений код.'
    case 'two_factor_restart':
      return 'Сеанс входу завершився. Увійдіть ще раз.'
    case 'rate_limited':
      return error.retryAfter === null
        ? 'Забагато спроб. Спробуйте пізніше.'
        : `Забагато спроб. Спробуйте через ${error.retryAfter} с.`
    case 'token_invalid':
      return 'Сеанс завершився. Увійдіть знову.'
    case 'password_confirmation_failed':
      return 'Невірний пароль.'
    case 'panel_name_conflict':
      return 'Щит із такою назвою вже існує. Оберіть іншу назву.'
    case 'panel_version_conflict':
      return 'Щит змінено в іншому місці. Перезавантажте сторінку.'
    case 'panel_not_in_trash':
      return 'Щит не знаходиться в кошику.'
    case 'panel_content_id_conflict':
      return 'Конфлікт ідентифікаторів вмісту щита. Перезавантажте сторінку.'
    case 'validation':
      return 'Перевірте введені дані.'
    case 'network':
      return 'Не вдалося зʼєднатися із сервером. Перевірте зʼєднання.'
    default:
      return 'Сталася помилка. Спробуйте пізніше.'
  }
}
