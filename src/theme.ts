/**
 * Theme model: `mode` (light / dark / system) and `palette`, mapped onto the 8 Vuetify themes defined
 * in `plugins/vuetify.ts`. Framework-free helpers only; the reactive state is `useAppTheme`.
 */
export const THEME_MODES = ['light', 'dark', 'system'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_PALETTES = ['blue', 'green', 'orange', 'violet'] as const
export type ThemePalette = (typeof THEME_PALETTES)[number]

export interface ThemeChoice {
  mode: ThemeMode
  palette: ThemePalette
}

export type ThemeName = `${ThemePalette}${'Light' | 'Dark'}`

export const DEFAULT_THEME: ThemeChoice = { mode: 'system', palette: 'blue' }

/** `localStorage` key of the chosen theme (a JSON `{mode, palette}`). */
export const THEME_STORAGE_KEY = 'electrical.theme'

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((m) => m === value)
}

export function isThemePalette(value: unknown): value is ThemePalette {
  return THEME_PALETTES.some((p) => p === value)
}

/** The remembered choice, or null when absent, malformed or storage is blocked. */
export function storedTheme(): ThemeChoice | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { mode, palette } = parsed as Record<string, unknown>
    return isThemeMode(mode) && isThemePalette(palette) ? { mode, palette } : null
  } catch {
    return null
  }
}

export function rememberTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // storage unavailable: the choice just is not remembered
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

export function resolveThemeName(choice: ThemeChoice, prefersDark: boolean): ThemeName {
  const dark = choice.mode === 'dark' || (choice.mode === 'system' && prefersDark)
  return `${choice.palette}${dark ? 'Dark' : 'Light'}`
}

/** The theme to start with: stored choice (or default) resolved against the system preference. */
export function initialThemeName(): ThemeName {
  return resolveThemeName(storedTheme() ?? DEFAULT_THEME, systemPrefersDark())
}
