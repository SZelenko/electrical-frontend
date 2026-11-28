import 'vuetify/styles'
import { useI18n } from 'vue-i18n'
import { createVuetify, type ThemeDefinition } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { i18n } from '@/i18n'
import { initialThemeName, THEME_PALETTES, type ThemeName, type ThemePalette } from '@/theme'

type VuetifyI18n = Parameters<typeof createVueI18nAdapter>[0]['i18n'] // our i18n has a narrower locale union

/** Palette accents; blue primary is close to the former hard-coded #0a64d6. */
export const ACCENTS: Record<ThemePalette, { light: string; dark: string }> = {
  blue: { light: '#0a64d6', dark: '#8ab4ff' },
  green: { light: '#1b7f3b', dark: '#7bd88f' },
  orange: { light: '#c25e00', dark: '#ffb066' },
  violet: { light: '#6a3fc2', dark: '#c2a6ff' },
}

/**
 * Schematic chrome colours (consumed later as `--schematic-*` custom properties, see assets.css):
 * sheet background, rail, device body, frame/stroke, caption text, bend handle, selection, hover.
 * Wire colours and the short-circuit halo are domain colours and are not themed.
 */
const SCHEMATIC = {
  light: {
    'schematic-canvas': '#f4f6f9',
    'schematic-sheet': '#ffffff',
    'schematic-border': '#c3cad4',
    'schematic-rail': '#c9ced6',
    'schematic-rail-edge': '#8a93a0',
    'schematic-device': '#fafbfc',
    'schematic-device-alt': '#e8ebef',
    'schematic-part': '#cfd4dc',
    'schematic-part-edge': '#8d96a3',
    'schematic-part-strong': '#aeb4bd',
    'schematic-frame': '#3b4658',
    'schematic-caption': '#1f2733',
    'schematic-muted': '#55606f',
    'schematic-bend': '#0a64d6',
    'schematic-selection': '#0a64d6',
    'schematic-hover': '#4f8fe0',
    'schematic-error': '#b00020',
    'schematic-casing': '#e3e8ef',
  },
  dark: {
    'schematic-canvas': '#16191e',
    'schematic-sheet': '#20252c',
    'schematic-border': '#3a424d',
    'schematic-rail': '#4a525d',
    'schematic-rail-edge': '#7b8594',
    'schematic-device': '#2b313a',
    'schematic-device-alt': '#363d48',
    'schematic-part': '#434b57',
    'schematic-part-edge': '#7b8594',
    'schematic-part-strong': '#69727f',
    'schematic-frame': '#9aa5b4',
    'schematic-caption': '#e3e8ef',
    'schematic-muted': '#a3adbb',
    'schematic-bend': '#8ab4ff',
    'schematic-selection': '#8ab4ff',
    'schematic-hover': '#6f9be0',
    'schematic-error': '#ff6b81',
    'schematic-casing': '#e3e8ef',
  },
} as const

function theme(palette: ThemePalette, dark: boolean): ThemeDefinition {
  const accent = ACCENTS[palette][dark ? 'dark' : 'light']
  return {
    dark,
    colors: {
      primary: accent,
      secondary: dark ? '#9aa5b4' : '#55606f',
      error: dark ? '#ff6b81' : '#b00020',
      success: dark ? '#6fd08c' : '#1b5e20',
      warning: dark ? '#ffb74d' : '#b35c00',
      info: accent,
      background: dark ? '#121417' : '#f6f7f9',
      surface: dark ? '#1b1f25' : '#ffffff',
      ...SCHEMATIC[dark ? 'dark' : 'light'],
    },
  }
}

const themes = {} as Record<ThemeName, ThemeDefinition>
for (const palette of THEME_PALETTES) {
  themes[`${palette}Light`] = theme(palette, false)
  themes[`${palette}Dark`] = theme(palette, true)
}

/** The default theme is resolved synchronously from the stored choice, so there is no flash. */
export const vuetify = createVuetify({
  theme: { defaultTheme: initialThemeName(), themes },
  // Vuetify's built-in strings follow the vue-i18n locale
  locale: { adapter: createVueI18nAdapter({ i18n: i18n as unknown as VuetifyI18n, useI18n }) },
  // dense editor look; forms override it (FormField: comfortable, details shown)
  defaults: {
    VBtn: { variant: 'tonal' },
    VSelect: { density: 'compact', variant: 'outlined', hideDetails: true },
    VTextField: { density: 'compact', variant: 'outlined', hideDetails: true },
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
})
