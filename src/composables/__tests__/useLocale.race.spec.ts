/** Rapid language changes while signed in, and the switcher while the session is being checked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { i18n, LOCALE_STORAGE_KEY } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { jsonResponse, ME } from '@/test/http'
import { useLocale } from '../useLocale'

interface Pending {
  locale: string
  respond: (ok: boolean) => void
}

/** A fetch whose PUT /me/locale answers only when the test says so. */
function controlledFetch() {
  const pending: Pending[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit = {}) => {
      const locale = JSON.parse(init.body as string).locale as string
      return new Promise<Response>((resolve) => {
        pending.push({
          locale,
          respond: (ok) =>
            resolve(
              ok ? jsonResponse(200, { ...ME, locale }) : jsonResponse(500, { type: 'unknown' }),
            ),
        })
      })
    }),
  )
  return pending
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  localStorage.clear()
  setActivePinia(createPinia())
  useAuthStore().status = 'authenticated'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

const tick = () => flushPromises()

describe('setLocale: two quick changes', () => {
  it('sends only the latest value when the second call comes before the first is sent', async () => {
    const pending = controlledFetch()
    const { setLocale } = useLocale()
    const first = setLocale('en')
    const second = setLocale('uk')
    await tick()
    expect(pending.map((p) => p.locale)).toEqual(['uk'])
    pending[0]!.respond(true)
    await expect(first).resolves.toBeNull()
    await expect(second).resolves.toBe(true)
    expect(i18n.global.locale.value).toBe('uk')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('uk')
  })

  it('a stale response never wins: the newer save is sent after the older one answered', async () => {
    const pending = controlledFetch()
    const { setLocale } = useLocale()
    const first = setLocale('en')
    await tick()
    expect(pending.map((p) => p.locale)).toEqual(['en']) // in flight
    const second = setLocale('uk')
    await tick()
    expect(pending).toHaveLength(1) // serialised: the newer PUT waits for the older one
    pending[0]!.respond(true)
    await expect(first).resolves.toBeNull()
    await tick()
    expect(pending.map((p) => p.locale)).toEqual(['en', 'uk'])
    pending[1]!.respond(true)
    await expect(second).resolves.toBe(true)
    expect(i18n.global.locale.value).toBe('uk')
  })

  it('a stale failure resolves null; the newest failure resolves false', async () => {
    const pending = controlledFetch()
    const { setLocale } = useLocale()
    const first = setLocale('en')
    await tick()
    const second = setLocale('uk')
    pending[0]!.respond(false)
    await expect(first).resolves.toBeNull()
    await tick()
    pending[1]!.respond(false)
    await expect(second).resolves.toBe(false)
  })
})

describe('LanguageSwitcher with quick changes', () => {
  function mountIt() {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().status = 'authenticated'
    return mount(LanguageSwitcher, { global: { plugins: [pinia] } })
  }
  const notice = (w: ReturnType<typeof mountIt>) => w.find('[data-testid=locale-not-saved]')

  it('a stale failure neither sets the notice nor hides the newer success', async () => {
    const pending = controlledFetch()
    const w = mountIt()
    const select = w.get('select')
    await select.setValue('en')
    await tick()
    await select.setValue('uk')
    pending[0]!.respond(false) // the older save failed after a newer choice was made
    await tick()
    expect(notice(w).exists()).toBe(false)
    pending[1]!.respond(true)
    await tick()
    expect(notice(w).exists()).toBe(false)
  })

  it('a stale success does not clear the notice of the newest failure', async () => {
    const pending = controlledFetch()
    const w = mountIt()
    const select = w.get('select')
    await select.setValue('en')
    await tick()
    await select.setValue('uk')
    pending[0]!.respond(true)
    await tick()
    expect(notice(w).exists()).toBe(false)
    pending[1]!.respond(false)
    await tick()
    expect(notice(w).exists()).toBe(true)
  })

  it('the dismiss button hides the notice', async () => {
    const pending = controlledFetch()
    const w = mountIt()
    await w.get('select').setValue('en')
    await tick()
    pending[0]!.respond(false)
    await tick()
    expect(notice(w).exists()).toBe(true)
    await notice(w).get('button').trigger('click')
    expect(notice(w).exists()).toBe(false)
  })

  it('the dismiss button is labelled in the current language', async () => {
    const pending = controlledFetch()
    const w = mountIt()
    await w.get('select').setValue('en')
    await tick()
    pending[0]!.respond(false)
    await tick()
    expect(notice(w).get('button').attributes('aria-label')).toBe('Close')
  })
})

describe('LanguageSwitcher while the session status is unknown', () => {
  it('is disabled until the session check finishes, then enabled', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    expect(auth.status).toBe('unknown')
    const w = mount(LanguageSwitcher, { global: { plugins: [pinia] } })
    expect(w.get('select').attributes('disabled')).toBeDefined()
    auth.status = 'anonymous'
    await tick()
    expect(w.get('select').attributes('disabled')).toBeUndefined()
  })

  it.each(['anonymous', 'authenticated', 'reloginNeeded'] as const)(
    'is enabled when %s',
    (status) => {
      const pinia = createPinia()
      setActivePinia(pinia)
      useAuthStore().status = status
      const w = mount(LanguageSwitcher, { global: { plugins: [pinia] } })
      expect(w.get('select').attributes('disabled')).toBeUndefined()
    },
  )
})
