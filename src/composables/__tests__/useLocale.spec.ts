import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { applyLocale, i18n, LOCALE_STORAGE_KEY } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { jsonResponse, ME, problem, routeFetch } from '@/test/http'
import { useLocale } from '../useLocale'

const PUT = 'PUT /me/locale'

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

const current = () => i18n.global.locale.value

describe('auth store: the profile locale on loadUser', () => {
  it.each(['uk', 'en'] as const)(
    'applies me.locale %s after the session restore',
    async (profile) => {
      applyLocale(profile === 'uk' ? 'en' : 'uk')
      routeFetch({
        'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
        'GET /me': () => jsonResponse(200, { ...ME, locale: profile }),
      })
      await useAuthStore().bootstrap()
      expect(current()).toBe(profile)
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(profile)
    },
  )

  it('applies me.locale after a password login and never writes it back', async () => {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, { ...ME, locale: 'en' }),
    })
    await expect(useAuthStore().login('a@b.c', 'pw')).resolves.toBe('authenticated')
    expect(current()).toBe('en')
    expect(f.count(PUT)).toBe(0)
  })

  it('keeps the current locale and saves nothing when me.locale is null', async () => {
    applyLocale('en')
    const f = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, { ...ME, locale: null }),
    })
    await useAuthStore().bootstrap()
    expect(current()).toBe('en')
    expect(f.count(PUT)).toBe(0)
  })

  it('ignores an unsupported profile locale', async () => {
    applyLocale('en')
    routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, { ...ME, locale: 'fr' }),
    })
    await useAuthStore().bootstrap()
    expect(current()).toBe('en')
  })
})

describe('useLocale().setLocale', () => {
  it('signed in: switches, remembers and saves to the profile (PUT /me/locale)', async () => {
    const f = routeFetch({ [PUT]: () => jsonResponse(200, { ...ME, locale: 'en' }) })
    const auth = useAuthStore()
    auth.status = 'authenticated'
    await expect(useLocale().setLocale('en')).resolves.toBe(true)
    expect(current()).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(f.count(PUT)).toBe(1)
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({ locale: 'en' })
  })

  it('signed in, save fails: returns false but the language stays changed', async () => {
    routeFetch({ [PUT]: () => problem(500, 'unknown') })
    useAuthStore().status = 'authenticated'
    await expect(useLocale().setLocale('en')).resolves.toBe(false)
    expect(current()).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('signed in, network failure: returns false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    useAuthStore().status = 'authenticated'
    await expect(useLocale().setLocale('en')).resolves.toBe(false)
  })

  it('signed out: switches and remembers without any request', async () => {
    const f = routeFetch({})
    await expect(useLocale().setLocale('en')).resolves.toBe(true)
    expect(current()).toBe('en')
    expect(f.calls).toHaveLength(0)
  })

  it('exposes the current locale reactively', async () => {
    const { locale, setLocale } = useLocale()
    expect(locale.value).toBe('uk')
    await setLocale('en')
    expect(locale.value).toBe('en')
  })
})

describe('LanguageSwitcher', () => {
  const mountIt = () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    // the select is disabled while the session bootstrap is pending ('unknown')
    useAuthStore().status = 'anonymous'
    return mount(LanguageSwitcher, { global: { plugins: [pinia] } })
  }

  it('changes the language and re-renders its own label', async () => {
    const w = mountIt()
    expect(w.text()).toContain('Мова')
    await w.get('[data-testid=language-switcher]').setValue('en')
    await flushPromises()
    expect(current()).toBe('en')
    expect(w.text()).toContain('Language')
    expect(w.find('[data-testid=locale-not-saved]').exists()).toBe(false)
  })

  it('shows a status notice when saving to the profile fails, and clears it on success', async () => {
    let fail = true
    routeFetch({
      [PUT]: () => (fail ? problem(500, 'unknown') : jsonResponse(200, { ...ME, locale: 'uk' })),
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().status = 'authenticated'
    const w = mount(LanguageSwitcher, { global: { plugins: [pinia] } })
    const select = w.get('[data-testid=language-switcher]')
    await select.setValue('en')
    await flushPromises()
    const notice = w.get('[data-testid=locale-not-saved]')
    expect(notice.attributes('role')).toBe('status')
    expect(notice.text()).toContain('Could not save the language to your profile')
    expect(current()).toBe('en')
    fail = false
    await select.setValue('uk')
    await flushPromises()
    expect(w.find('[data-testid=locale-not-saved]').exists()).toBe(false)
  })

  it('signed out: no request and no notice', async () => {
    const f = routeFetch({})
    const w = mountIt()
    await w.get('[data-testid=language-switcher]').setValue('en')
    await flushPromises()
    expect(f.calls).toHaveLength(0)
    expect(w.find('[data-testid=locale-not-saved]').exists()).toBe(false)
  })

  it('offers exactly the supported languages', () => {
    const values = mountIt()
      .findAll('option')
      .map((o) => o.attributes('value'))
    expect(values).toEqual(['uk', 'en'])
  })
})
