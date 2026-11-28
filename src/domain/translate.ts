/**
 * Text producers in `domain/` stay framework-free: they receive a translate function instead of
 * importing vue-i18n. Keys are typed from the reference locale file.
 */
import type uk from '@/locales/uk.json'

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

/** Every message key of the reference (Ukrainian) locale, e.g. `editor.toolbar.addRail`. */
export type MessageKey = Paths<typeof uk>

/**
 * Named message parameters. A numeric `n` also selects the plural form of messages written as
 * `one | few | many` (Ukrainian) or `one | other` (English).
 */
export type TranslateParams = Record<string, string | number>

export type Translate = (key: MessageKey, params?: TranslateParams) => string
