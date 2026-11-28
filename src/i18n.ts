import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { en as vuetifyEn, uk as vuetifyUk } from 'vuetify/locale'
import type { Translate, TranslateParams } from '@/domain/translate'
import en from './locales/en.json'
import uk from './locales/uk.json'

export const LOCALES = ['uk', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** `localStorage` key of the chosen language. */
export const LOCALE_STORAGE_KEY = 'electrical.locale'

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l === value)
}

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    return null // storage blocked: fall through to the browser language
  }
}

/** The stored choice, else the browser language (`uk*` -> `uk`, anything else -> `en`). */
export function detectLocale(): Locale {
  const stored = storedLocale()
  if (stored) return stored
  const browser = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase()
  return browser === 'uk' || browser.startsWith('uk-') ? 'uk' : 'en'
}

/** Ukrainian plural rule: index 0 (one: 1, 21), 1 (few: 2-4, 22-24), 2 (many: the rest, 11-14). */
function pluralRuleUk(choice: number, choicesLength: number): number {
  if (choicesLength !== 3) return choice === 1 ? 0 : 1
  const abs = Math.abs(choice)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return 0
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1
  return 2
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'uk',
  // violation texts fall back to the server's English message for a code we have no key for
  missingWarn: /^(?!violations\.)/,
  fallbackWarn: /^(?!violations\.)/,
  // Vuetify's own texts (`$vuetify.*`) ride along; the app's files stay plain JSON
  messages: { uk: { ...uk, $vuetify: vuetifyUk }, en: { ...en, $vuetify: vuetifyEn } },
  pluralRules: { uk: pluralRuleUk },
})

const composer = i18n.global

/**
 * Switches the UI language and remembers it in `localStorage`. It never touches the profile: the
 * profile locale is applied here after `GET /me`, a user's choice goes through `useLocale().setLocale`.
 */
export function applyLocale(next: Locale): void {
  composer.locale.value = next
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // storage unavailable: the choice just is not remembered
  }
}

/** Numeric parameters (except the plural count `n`) in the locale's own number format, e.g. `2,5`. */
function formatNumbers(params: TranslateParams): TranslateParams {
  const format = new Intl.NumberFormat(composer.locale.value, {
    useGrouping: false,
    maximumFractionDigits: 10,
  })
  const result: TranslateParams = {}
  for (const [name, value] of Object.entries(params)) {
    result[name] = typeof value === 'number' && name !== 'n' ? format.format(value) : value
  }
  return result
}

/**
 * Translates a key of `src/locales/uk.json`. Reactive: reading it in a template or a computed
 * tracks the current locale. A numeric `n` parameter selects the plural form.
 */
export const t: Translate = (key, params) => {
  const named = formatNumbers(params ?? {})
  const n = params?.n
  return typeof n === 'number' ? composer.t(key, named, n) : composer.t(key, named)
}

// `<html lang>` and the document title follow the locale.
watch(
  composer.locale,
  (locale) => {
    if (typeof document === 'undefined') return // node-environment unit tests
    document.documentElement.lang = locale
    document.title = t('app.title')
  },
  { immediate: true, flush: 'sync' },
)
