import { computed } from 'vue'
import { applyLocale, i18n, isLocale, LOCALES, type Locale } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

// Profile saves are serialised; a save that a newer choice has replaced is never sent.
let latest = 0
let queue: Promise<unknown> = Promise.resolve()

/**
 * The language switcher's logic. A change is applied and remembered at once; when the user is signed
 * in it is also saved to the profile (`PUT /me/locale`). The profile locale itself is applied by the
 * auth store after `GET /me`, through `applyLocale` (no write back).
 */
export function useLocale() {
  const auth = useAuthStore()
  const locale = computed<Locale>(() => {
    const current = i18n.global.locale.value
    return isLocale(current) ? current : 'uk'
  })

  /**
   * Resolves to true when the language is saved (or nothing needs saving), false when saving to the
   * profile failed (the UI language stays changed) and null when a newer choice superseded this one.
   */
  async function setLocale(next: Locale): Promise<boolean | null> {
    applyLocale(next)
    const mine = ++latest
    if (!auth.isAuthenticated) return true
    const save = queue.then(async () => {
      if (mine !== latest) return null
      try {
        await auth.saveLocale(next)
        return true
      } catch {
        return false
      }
    })
    queue = save
    const result = await save
    return mine === latest ? result : null
  }

  return { locale, locales: LOCALES, setLocale }
}
