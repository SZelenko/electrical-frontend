import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { unref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AppearanceMenu from '@/components/AppearanceMenu.vue'
import { applyTheme, themeName } from '@/appTheme'
import { useAppTheme } from '@/composables/useAppTheme'
import { vuetify } from '@/plugins/vuetify'
import { useAuthStore } from '@/stores/auth'
import { jsonResponse, ME, routeFetch } from '@/test/http'
import { mountWithPlugins } from '@/test/mountWithPlugins'
import { THEME_STORAGE_KEY } from '@/theme'

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid=${id}]`)
const pressed = (id: string) => q(id)?.getAttribute('aria-pressed')

async function open() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().status = 'anonymous' // the button is disabled while the session check runs
  const { wrapper } = mountWithPlugins(AppearanceMenu, { pinia, attachTo: document.body })
  await wrapper.get('[data-testid=appearance-menu]').trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  localStorage.clear()
  setActivePinia(createPinia())
  applyTheme({ mode: 'light', palette: 'blue' })
  useAppTheme().notSaved.value = false
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('AppearanceMenu', () => {
  it('is closed until the button is pressed, then shows modes and palettes', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().status = 'anonymous'
    const { wrapper } = mountWithPlugins(AppearanceMenu, { pinia, attachTo: document.body })
    expect(q('mode-dark')).toBeNull()
    expect(wrapper.get('[data-testid=appearance-menu]').attributes('aria-label')).toBe('Вигляд')
    await wrapper.get('[data-testid=appearance-menu]').trigger('click')
    await flushPromises()
    const ids = [
      'mode-light',
      'mode-dark',
      'mode-system',
      'palette-blue',
      'palette-green',
      'palette-orange',
      'palette-violet',
    ]
    expect(ids.filter((id) => q(id) === null)).toEqual([])
  })

  it('the mode toggle is a labelled group and every mode button exposes aria-pressed', async () => {
    await open()
    const group = document.querySelector('[aria-labelledby=appearance-mode-label]')!
    expect(group.getAttribute('role')).toBe('group')
    expect(document.getElementById('appearance-mode-label')!.textContent).toContain('Режим')
    expect(['light', 'dark', 'system'].map((m) => pressed(`mode-${m}`))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(group.contains(q('mode-dark'))).toBe(true)
  })

  it('the activator is disabled while the session status is unknown, then enabled', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    expect(auth.status).toBe('unknown')
    const { wrapper } = mountWithPlugins(AppearanceMenu, { pinia, attachTo: document.body })
    const button = () => wrapper.get('[data-testid=appearance-menu]')
    expect(button().attributes('disabled')).toBeDefined()
    await button().trigger('click')
    await flushPromises()
    expect(q('mode-dark')).toBeNull() // it cannot be opened
    auth.status = 'anonymous'
    await flushPromises()
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it.each(['anonymous', 'authenticated', 'reloginNeeded'] as const)(
    'the activator is enabled when %s',
    (status) => {
      const pinia = createPinia()
      setActivePinia(pinia)
      useAuthStore().status = status
      const { wrapper } = mountWithPlugins(AppearanceMenu, { pinia })
      expect(wrapper.get('[data-testid=appearance-menu]').attributes('disabled')).toBeUndefined()
    },
  )

  it('marks the current palette as pressed', async () => {
    await open()
    expect(pressed('palette-blue')).toBe('true')
    expect(pressed('palette-green')).toBe('false')
  })

  it('selecting a palette updates aria-pressed and the active Vuetify theme', async () => {
    await open()
    q('palette-green')!.click()
    await flushPromises()
    expect(pressed('palette-green')).toBe('true')
    expect(pressed('palette-blue')).toBe('false')
    expect(unref(vuetify.theme.name)).toBe('greenLight')
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!)).toEqual({
      mode: 'light',
      palette: 'green',
    })
  })

  it('selecting a mode switches the theme to dark and back', async () => {
    await open()
    q('mode-dark')!.click()
    await flushPromises()
    expect(pressed('mode-dark')).toBe('true')
    expect(unref(vuetify.theme.name)).toBe('blueDark')
    q('mode-light')!.click()
    await flushPromises()
    expect(unref(vuetify.theme.name)).toBe('blueLight')
    expect(pressed('mode-light')).toBe('true')
    expect(pressed('mode-dark')).toBe('false')
    expect(pressed('mode-system')).toBe('false')
  })

  it('mode and palette combine', async () => {
    await open()
    q('mode-dark')!.click()
    await flushPromises()
    q('palette-violet')!.click()
    await flushPromises()
    expect(themeName.value).toBe('violetDark')
  })

  it('signed out: no notice and no request', async () => {
    const f = routeFetch({})
    await open()
    q('mode-dark')!.click()
    await flushPromises()
    expect(f.calls).toHaveLength(0)
    expect(q('theme-not-saved')).toBeNull()
  })

  it('signed in: the choice is sent to the profile', async () => {
    const f = routeFetch({ 'PUT /me/theme': () => jsonResponse(200, ME) })
    await open()
    useAuthStore().status = 'authenticated'
    q('palette-orange')!.click()
    await flushPromises()
    expect(f.count('PUT /me/theme')).toBe(1)
    expect(q('theme-not-saved')).toBeNull()
  })

  it('a failed save shows a notice; the theme stays changed; the dismiss button hides it', async () => {
    routeFetch({ 'PUT /me/theme': () => jsonResponse(500, { type: 'unknown' }) })
    await open()
    useAuthStore().status = 'authenticated'
    q('mode-dark')!.click()
    await flushPromises()
    const notice = q('theme-not-saved')
    expect(notice).not.toBeNull()
    expect(notice!.textContent).toContain('Не вдалося зберегти тему')
    expect(unref(vuetify.theme.name)).toBe('blueDark')
    expect(useAppTheme().notSaved.value).toBe(true)
    const close = notice!.querySelector('button')!
    expect(close.getAttribute('aria-label')).toBe('Закрити')
    close.click()
    await flushPromises()
    // the snackbar stays mounted while its fade-out transition is stubbed: the shared flag is the truth
    expect(useAppTheme().notSaved.value).toBe(false)
  })

  it('signing out clears the notice of a failed save', async () => {
    routeFetch({ 'PUT /me/theme': () => jsonResponse(500, { type: 'unknown' }) })
    await open()
    const auth = useAuthStore()
    auth.status = 'authenticated'
    q('mode-dark')!.click()
    await flushPromises()
    expect(useAppTheme().notSaved.value).toBe(true)
    auth.status = 'anonymous'
    await flushPromises()
    expect(useAppTheme().notSaved.value).toBe(false)
  })

  it('after signing out the next change (local only) also leaves no notice', async () => {
    routeFetch({ 'PUT /me/theme': () => jsonResponse(500, { type: 'unknown' }) })
    await open()
    const auth = useAuthStore()
    auth.status = 'authenticated'
    q('mode-dark')!.click()
    await flushPromises()
    auth.status = 'anonymous'
    q('mode-light')!.click()
    await flushPromises()
    expect(useAppTheme().notSaved.value).toBe(false)
  })
})
