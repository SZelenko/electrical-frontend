import { computed, ref, watch } from 'vue'
import { vuetify } from '@/plugins/vuetify'
import {
  DEFAULT_THEME,
  rememberTheme,
  resolveThemeName,
  storedTheme,
  systemPrefersDark,
  type ThemeChoice,
} from '@/theme'

// Shared, module-level state: every component sees the same theme (like the i18n locale).
export const themeChoice = ref<ThemeChoice>(storedTheme() ?? { ...DEFAULT_THEME })
const prefersDark = ref(systemPrefersDark())
export const themeName = computed(() => resolveThemeName(themeChoice.value, prefersDark.value))
export const isDarkTheme = computed(() => themeName.value.endsWith('Dark'))

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  // `system` follows the OS live
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => (prefersDark.value = e.matches))
}

// Applies the active theme to Vuetify and the document (native controls, scrollbars).
watch(
  themeName,
  (name) => {
    void vuetify.theme.change(name)
    if (typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = name.endsWith('Dark') ? 'dark' : 'light'
      // index.html set a first-paint background: keep it in step with the theme
      document.documentElement.style.background = String(
        vuetify.theme.themes.value[name]?.colors?.background ?? '',
      )
    }
  },
  { immediate: true, flush: 'sync' },
)

/**
 * Applies a theme and remembers it in `localStorage`. It never touches the profile: the profile
 * theme is applied here once after `GET /me`, a user's choice goes through `useAppTheme`.
 */
export function applyTheme(next: ThemeChoice): void {
  themeChoice.value = { ...next }
  rememberTheme(themeChoice.value)
}
