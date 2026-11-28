import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type Me } from '@/api/auth'
import { ApiError } from '@/api/problem'
import { configureApi, refreshSession } from '@/api/client'
import { applyTheme } from '@/appTheme'
import { applyLocale, isLocale, type Locale } from '@/i18n'
import { isThemeMode, isThemePalette, type ThemeChoice } from '@/theme'

/**
 * unknown: bootstrap not finished; anonymous: no session; authenticated: token in memory;
 * reloginNeeded: refresh failed mid-session (other app state stays untouched).
 */
export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated' | 'reloginNeeded'

/** Where the login screen should send the user next. */
export type LoginOutcome = 'authenticated' | 'twoFactor' | 'verifyEmail'

export const useAuthStore = defineStore('auth', () => {
  // The access token lives only here, in memory.
  const accessToken = ref<string | null>(null)
  const user = ref<Me | null>(null)
  const status = ref<AuthStatus>('unknown')
  /** Email carried between register/login and the verification screen (prefill only). */
  const pendingEmail = ref('')
  /** Short-lived token of the password step while a 2FA code is awaited. */
  const twoFactorToken = ref<string | null>(null)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  configureApi({
    getToken: () => accessToken.value,
    setToken: (token) => {
      accessToken.value = token
    },
    onSessionLost: () => {
      accessToken.value = null
      status.value = 'reloginNeeded'
    },
  })

  async function loadUser() {
    const { data } = await authApi.me()
    user.value = data
    status.value = 'authenticated'
    // The profile language wins when it is set; null keeps the current one (it is not saved here).
    if (isLocale(data.locale)) applyLocale(data.locale)
    // The profile theme is applied once, here. Nothing watches `user`: saveLocale/saveTheme replace
    // it, and a stale copy must never revert what the user chose since.
    if (isThemeMode(data.themeMode) && isThemePalette(data.themePalette)) {
      applyTheme({ mode: data.themeMode, palette: data.themePalette })
    }
  }

  /** Loads /me right after a login; on failure no half session (token without user) is kept. */
  async function loadUserAfterLogin() {
    try {
      await loadUser()
    } catch (error) {
      accessToken.value = null
      user.value = null
      throw error
    }
  }

  function clearSession() {
    accessToken.value = null
    user.value = null
    twoFactorToken.value = null
    status.value = 'anonymous'
  }

  let bootstrapPromise: Promise<void> | null = null

  /** Initial refresh + /me; runs once, later calls return the same promise. */
  function bootstrap(): Promise<void> {
    bootstrapPromise ??= (async () => {
      try {
        await refreshSession()
        await loadUser()
      } catch {
        clearSession()
      }
    })()
    return bootstrapPromise
  }

  async function register(email: string, password: string) {
    await authApi.register({ email, password })
    pendingEmail.value = email
  }

  async function verifyEmail(email: string, code: string) {
    await authApi.verifyEmail({ email, code })
  }

  async function resendVerificationCode(email: string) {
    await authApi.resendCode({ purpose: 'email_verification', email })
  }

  async function resendTwoFactorCode() {
    if (twoFactorToken.value === null) return
    await authApi.resendCode({ purpose: 'login_2fa', twoFactorToken: twoFactorToken.value })
  }

  async function login(email: string, password: string): Promise<LoginOutcome> {
    try {
      const result = await authApi.login({ email, password })
      if (result.kind === 'twoFactor') {
        twoFactorToken.value = result.twoFactorToken
        return 'twoFactor'
      }
      accessToken.value = result.token
      await loadUserAfterLogin()
      return 'authenticated'
    } catch (error) {
      if (error instanceof ApiError && error.type === 'email_not_verified') {
        pendingEmail.value = email
        return 'verifyEmail'
      }
      throw error
    }
  }

  async function submitTwoFactor(code: string) {
    if (twoFactorToken.value === null) {
      throw new ApiError({ status: 401, type: 'two_factor_restart', message: 'No pending 2FA' })
    }
    try {
      accessToken.value = await authApi.twoFactor({ twoFactorToken: twoFactorToken.value, code })
    } catch (error) {
      if (error instanceof ApiError && error.type === 'two_factor_restart') {
        twoFactorToken.value = null
      }
      throw error
    }
    twoFactorToken.value = null
    await loadUserAfterLogin()
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      // The local session is dropped even if the server could not be reached.
    }
    clearSession()
  }

  async function setTwoFactor(enabled: boolean, password: string) {
    const { data } = await authApi.setTwoFactor({ enabled, password })
    user.value = data
  }

  /** Saves the interface language to the profile (the UI language is changed by the caller). */
  async function saveLocale(locale: Locale) {
    const { data } = await authApi.setLocale({ locale })
    if (user.value) user.value = data
  }

  /** Saves the theme to the profile (the UI theme is changed by the caller). */
  async function saveTheme(theme: ThemeChoice) {
    const { data } = await authApi.setTheme(theme)
    if (user.value) user.value = data
  }

  return {
    user,
    status,
    isAuthenticated,
    pendingEmail,
    twoFactorToken,
    bootstrap,
    register,
    verifyEmail,
    resendVerificationCode,
    resendTwoFactorCode,
    login,
    submitTwoFactor,
    logout,
    setTwoFactor,
    saveLocale,
    saveTheme,
  }
})
