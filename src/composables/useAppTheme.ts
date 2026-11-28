import { computed, ref, watch } from 'vue'
import { applyTheme, isDarkTheme, themeChoice, themeName } from '@/appTheme'
import { useAuthStore } from '@/stores/auth'
import type { ThemeChoice, ThemeMode, ThemePalette } from '@/theme'

// Profile saves are serialised; a save that a newer choice has replaced is never sent.
let latest = 0
let queue: Promise<unknown> = Promise.resolve()
/** Set when the theme could not be saved to the profile; it never blocks the UI. */
const notSaved = ref(false)

/**
 * The appearance menu's logic. A change is applied and remembered at once; when the user is signed
 * in it is also saved to the profile (`PUT /me/theme`). The profile theme itself is applied once by
 * the auth store after `GET /me` (`applyTheme`); nothing watches `auth.user`.
 */
export function useAppTheme() {
  const auth = useAuthStore()
  // a notice from a signed-in session must not outlive it
  watch(
    () => auth.status,
    (status) => {
      if (status !== 'authenticated') notSaved.value = false
    },
  )

  /**
   * Resolves to true when saved (or nothing needs saving), false when saving to the profile failed
   * (the UI theme stays changed) and null when a newer choice superseded this one.
   */
  async function setTheme(next: ThemeChoice): Promise<boolean | null> {
    applyTheme(next)
    const mine = ++latest
    if (!auth.isAuthenticated) {
      notSaved.value = false // a notice from a signed-in session must not outlive it
      return true
    }
    const save = queue.then(async () => {
      if (mine !== latest) return null
      try {
        await auth.saveTheme(next)
        return true
      } catch {
        return false
      }
    })
    queue = save
    const result = await save
    if (mine !== latest) return null
    notSaved.value = !result
    return result
  }

  const setMode = (mode: ThemeMode) => setTheme({ ...themeChoice.value, mode })
  const setPalette = (palette: ThemePalette) => setTheme({ ...themeChoice.value, palette })

  return {
    mode: computed(() => themeChoice.value.mode),
    palette: computed(() => themeChoice.value.palette),
    themeName,
    isDark: isDarkTheme,
    notSaved,
    setMode,
    setPalette,
  }
}
