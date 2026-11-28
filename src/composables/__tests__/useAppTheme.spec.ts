import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { unref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { applyTheme, themeChoice, themeName } from '@/appTheme'
import { vuetify } from '@/plugins/vuetify'
import { useAuthStore } from '@/stores/auth'
import { jsonResponse, ME, routeFetch } from '@/test/http'
import { THEME_STORAGE_KEY } from '@/theme'
import { useAppTheme } from '../useAppTheme'
import { useLocale } from '../useLocale'
import { applyLocale, i18n } from '@/i18n'

const PUT = 'PUT /me/theme'
const stored = () => JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? 'null')
const vuetifyName = () => unref(vuetify.theme.name)
const body = (init: RequestInit) => JSON.parse(init.body as string)

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  localStorage.clear()
  setActivePinia(createPinia())
  applyTheme({ mode: 'light', palette: 'blue' })
  localStorage.clear()
  useAppTheme().notSaved.value = false
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('theme sources', () => {
  it('the profile theme wins after loadUser and is cached in localStorage', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, '{"mode":"light","palette":"green"}')
    const f = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, { ...ME, themeMode: 'dark', themePalette: 'violet' }),
    })
    await useAuthStore().bootstrap()
    expect(themeChoice.value).toEqual({ mode: 'dark', palette: 'violet' })
    expect(themeName.value).toBe('violetDark')
    expect(vuetifyName()).toBe('violetDark')
    expect(stored()).toEqual({ mode: 'dark', palette: 'violet' })
    expect(f.count(PUT)).toBe(0) // applying the profile never writes it back
  })

  it('a null profile theme keeps the current (localStorage) choice and saves nothing', async () => {
    applyTheme({ mode: 'dark', palette: 'orange' })
    const f = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
    })
    await useAuthStore().bootstrap()
    expect(themeName.value).toBe('orangeDark')
    expect(f.count(PUT)).toBe(0)
  })

  it.each([
    ['unknown mode', { themeMode: 'auto', themePalette: 'green' }],
    ['unknown palette', { themeMode: 'dark', themePalette: 'pink' }],
    ['only the mode', { themeMode: 'dark', themePalette: null }],
    ['only the palette', { themeMode: null, themePalette: 'green' }],
  ])('ignores a partial or invalid profile theme (%s)', async (_n, profile) => {
    applyTheme({ mode: 'light', palette: 'orange' })
    routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, { ...ME, ...profile }),
    })
    await useAuthStore().bootstrap()
    expect(themeName.value).toBe('orangeLight')
  })

  it('applyTheme changes the theme and localStorage but never calls the API', async () => {
    const f = routeFetch({})
    useAuthStore().status = 'authenticated'
    applyTheme({ mode: 'dark', palette: 'green' })
    await flushPromises()
    expect(themeName.value).toBe('greenDark')
    expect(vuetifyName()).toBe('greenDark')
    expect(stored()).toEqual({ mode: 'dark', palette: 'green' })
    expect(f.calls).toHaveLength(0)
  })

  it('applyTheme copies its argument (later mutation does not leak in)', () => {
    const choice = { mode: 'dark', palette: 'green' } as const
    applyTheme(choice)
    expect(themeChoice.value).not.toBe(choice)
  })
})

describe('useAppTheme: setMode / setPalette', () => {
  it('signed out: changes the theme and localStorage, sends no request', async () => {
    const f = routeFetch({})
    const { setMode, setPalette, notSaved } = useAppTheme()
    await expect(setMode('dark')).resolves.toBe(true)
    await expect(setPalette('violet')).resolves.toBe(true)
    expect(themeName.value).toBe('violetDark')
    expect(vuetifyName()).toBe('violetDark')
    expect(stored()).toEqual({ mode: 'dark', palette: 'violet' })
    expect(f.calls).toHaveLength(0)
    expect(notSaved.value).toBe(false)
  })

  it('signed in: PUT /me/theme with {mode, palette}', async () => {
    const f = routeFetch({
      [PUT]: () => jsonResponse(200, { ...ME, themeMode: 'dark', themePalette: 'blue' }),
    })
    useAuthStore().status = 'authenticated'
    await expect(useAppTheme().setMode('dark')).resolves.toBe(true)
    expect(f.count(PUT)).toBe(1)
    expect(body(f.calls[0]!.init)).toEqual({ mode: 'dark', palette: 'blue' })
    expect(themeName.value).toBe('blueDark')
  })

  it('setPalette keeps the current mode in the saved body', async () => {
    const f = routeFetch({ [PUT]: () => jsonResponse(200, ME) })
    useAuthStore().status = 'authenticated'
    await useAppTheme().setPalette('orange')
    expect(body(f.calls[0]!.init)).toEqual({ mode: 'light', palette: 'orange' })
  })

  it('a saved response replaces the cached user', async () => {
    routeFetch({
      [PUT]: () => jsonResponse(200, { ...ME, themeMode: 'dark', themePalette: 'blue' }),
    })
    const auth = useAuthStore()
    auth.status = 'authenticated'
    auth.user = { ...ME } as typeof auth.user
    await useAppTheme().setMode('dark')
    expect(auth.user?.themeMode).toBe('dark')
  })

  it('failed PUT: resolves false, notSaved is set, the theme stays changed', async () => {
    routeFetch({ [PUT]: () => jsonResponse(500, { type: 'unknown' }) })
    useAuthStore().status = 'authenticated'
    const { setMode, notSaved } = useAppTheme()
    await expect(setMode('dark')).resolves.toBe(false)
    expect(notSaved.value).toBe(true)
    expect(themeName.value).toBe('blueDark')
    expect(stored()).toEqual({ mode: 'dark', palette: 'blue' })
  })

  it('a network failure also ends in notSaved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    )
    useAuthStore().status = 'authenticated'
    const { setPalette, notSaved } = useAppTheme()
    await expect(setPalette('green')).resolves.toBe(false)
    expect(notSaved.value).toBe(true)
    expect(themeName.value).toBe('greenLight')
  })

  it('a later successful save clears the notice', async () => {
    let ok = false
    routeFetch({ [PUT]: () => (ok ? jsonResponse(200, ME) : jsonResponse(500, { type: 'x' })) })
    useAuthStore().status = 'authenticated'
    const { setMode, notSaved } = useAppTheme()
    await setMode('dark')
    expect(notSaved.value).toBe(true)
    ok = true
    await setMode('light')
    expect(notSaved.value).toBe(false)
  })
})

interface Pending {
  key: string
  payload: Record<string, unknown>
  respond: (ok: boolean, overrides?: Record<string, unknown>) => void
}

/** A fetch whose PUT /me/theme and PUT /me/locale answer only when the test says so. */
function controlledFetch() {
  const pending: Pending[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const key = `${init.method} ${url.replace(/^https?:\/\/[^/]+\/api\/v1/, '')}`
      const payload = JSON.parse(init.body as string)
      return new Promise<Response>((resolve) => {
        pending.push({
          key,
          payload,
          respond: (ok, overrides = {}) =>
            resolve(
              ok
                ? jsonResponse(200, { ...ME, ...overrides })
                : jsonResponse(500, { type: 'unknown' }),
            ),
        })
      })
    }),
  )
  return pending
}

describe('useAppTheme: rapid changes', () => {
  beforeEach(() => {
    useAuthStore().status = 'authenticated'
  })

  it('sends only the latest choice when the second call comes before the first is sent', async () => {
    const pending = controlledFetch()
    const { setMode, setPalette } = useAppTheme()
    const first = setMode('dark')
    const second = setPalette('green')
    await flushPromises()
    expect(pending.map((p) => p.payload)).toEqual([{ mode: 'dark', palette: 'green' }])
    pending[0]!.respond(true)
    await expect(first).resolves.toBeNull()
    await expect(second).resolves.toBe(true)
    expect(themeName.value).toBe('greenDark')
  })

  it('serialises saves: the newer PUT waits for the in-flight one; the last choice ends up on the server', async () => {
    const pending = controlledFetch()
    const { setMode, setPalette } = useAppTheme()
    const first = setMode('dark')
    await flushPromises()
    const second = setPalette('violet')
    await flushPromises()
    expect(pending).toHaveLength(1)
    pending[0]!.respond(true)
    await expect(first).resolves.toBeNull()
    await flushPromises()
    expect(pending.map((p) => p.payload)).toEqual([
      { mode: 'dark', palette: 'blue' },
      { mode: 'dark', palette: 'violet' },
    ])
    pending[1]!.respond(true)
    await expect(second).resolves.toBe(true)
    expect(themeName.value).toBe('violetDark')
  })

  it('a stale response never reverts the theme', async () => {
    const pending = controlledFetch()
    const { setMode, setPalette } = useAppTheme()
    const first = setMode('dark')
    await flushPromises()
    const second = setPalette('orange')
    // the old save answers with the OLD choice
    pending[0]!.respond(true, { themeMode: 'dark', themePalette: 'blue' })
    await first
    await flushPromises()
    expect(themeName.value).toBe('orangeDark')
    pending[1]!.respond(true, { themeMode: 'dark', themePalette: 'orange' })
    await second
    expect(themeName.value).toBe('orangeDark')
    expect(stored()).toEqual({ mode: 'dark', palette: 'orange' })
  })

  it('a stale failure resolves null and sets no notice; the newest failure sets it', async () => {
    const pending = controlledFetch()
    const { setMode, setPalette, notSaved } = useAppTheme()
    const first = setMode('dark')
    await flushPromises()
    const second = setPalette('green')
    pending[0]!.respond(false)
    await expect(first).resolves.toBeNull()
    expect(notSaved.value).toBe(false)
    await flushPromises()
    pending[1]!.respond(false)
    await expect(second).resolves.toBe(false)
    expect(notSaved.value).toBe(true)
  })

  it('a stale success does not clear the newest failure notice', async () => {
    const pending = controlledFetch()
    const { setMode, setPalette, notSaved } = useAppTheme()
    const first = setMode('dark')
    await flushPromises()
    const second = setPalette('green')
    pending[0]!.respond(true)
    await first
    await flushPromises()
    pending[1]!.respond(false)
    await second
    expect(notSaved.value).toBe(true)
  })
})

describe('theme and locale saves do not overwrite each other', () => {
  beforeEach(() => {
    const auth = useAuthStore()
    auth.status = 'authenticated'
    auth.user = { ...ME, locale: 'uk' } as typeof auth.user
    applyLocale('uk')
  })

  it('a locale response carrying the OLD theme does not revert a theme PUT in flight', async () => {
    const pending = controlledFetch()
    const setThemeP = useAppTheme().setMode('dark')
    await flushPromises()
    const setLocaleP = useLocale().setLocale('en')
    await flushPromises()
    const locale = pending.find((p) => p.key === 'PUT /me/locale')!
    locale.respond(true, { locale: 'en', themeMode: 'light', themePalette: 'blue' })
    await setLocaleP
    await flushPromises()
    expect(themeName.value).toBe('blueDark')
    expect(vuetifyName()).toBe('blueDark')
    expect(stored()).toEqual({ mode: 'dark', palette: 'blue' })
    pending
      .find((p) => p.key === 'PUT /me/theme')!
      .respond(true, {
        locale: 'en',
        themeMode: 'dark',
        themePalette: 'blue',
      })
    await setThemeP
    expect(themeName.value).toBe('blueDark')
    expect(i18n.global.locale.value).toBe('en')
  })

  it('a theme response carrying the OLD locale does not revert the locale', async () => {
    const pending = controlledFetch()
    const setLocaleP = useLocale().setLocale('en')
    await flushPromises()
    const setThemeP = useAppTheme().setPalette('green')
    await flushPromises()
    pending
      .find((p) => p.key === 'PUT /me/theme')!
      .respond(true, {
        locale: 'uk',
        themeMode: 'light',
        themePalette: 'green',
      })
    await setThemeP
    await flushPromises()
    expect(i18n.global.locale.value).toBe('en')
    expect(themeName.value).toBe('greenLight')
    pending.find((p) => p.key === 'PUT /me/locale')!.respond(true, { locale: 'en' })
    await setLocaleP
    expect(i18n.global.locale.value).toBe('en')
    expect(themeName.value).toBe('greenLight')
  })
})
