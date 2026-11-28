/**
 * `system` mode follows the OS live. appTheme registers its matchMedia listener when it is first
 * imported, so this file stubs matchMedia first and imports the module afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unref } from 'vue'

let dark = false
let listeners: ((e: { matches: boolean }) => void)[] = []

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return dark
    },
    media: query,
    addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: () => {},
  }))
  // jsdom's window.matchMedia is what the module reads
  window.matchMedia = globalThis.matchMedia
}
const osChange = (matches: boolean) => {
  dark = matches
  listeners.forEach((l) => l({ matches }))
}

async function load() {
  vi.resetModules()
  const app = await import('@/appTheme')
  const { vuetify } = await import('@/plugins/vuetify')
  return { app, vuetify }
}

beforeEach(() => {
  dark = false
  listeners = []
  localStorage.clear()
  stubMatchMedia()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('system mode', () => {
  it('starts from the OS preference (dark) with the default system + blue', async () => {
    dark = true
    const { app, vuetify } = await load()
    expect(app.themeName.value).toBe('blueDark')
    expect(unref(vuetify.theme.name)).toBe('blueDark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('follows an OS change live, both ways', async () => {
    const { app, vuetify } = await load()
    expect(app.themeName.value).toBe('blueLight')
    osChange(true)
    expect(app.themeName.value).toBe('blueDark')
    expect(unref(vuetify.theme.name)).toBe('blueDark')
    expect(app.isDarkTheme.value).toBe(true)
    osChange(false)
    expect(app.themeName.value).toBe('blueLight')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('keeps the chosen palette across an OS change', async () => {
    localStorage.setItem('electrical.theme', '{"mode":"system","palette":"violet"}')
    const { app } = await load()
    osChange(true)
    expect(app.themeName.value).toBe('violetDark')
  })

  it.each(['light', 'dark'] as const)('an explicit %s mode ignores OS changes', async (mode) => {
    localStorage.setItem('electrical.theme', JSON.stringify({ mode, palette: 'green' }))
    const { app } = await load()
    const before = app.themeName.value
    osChange(true)
    expect(app.themeName.value).toBe(before)
    osChange(false)
    expect(app.themeName.value).toBe(before)
  })

  it('a stored choice is used at start-up (no flash on a reload)', async () => {
    localStorage.setItem('electrical.theme', '{"mode":"dark","palette":"orange"}')
    const { app } = await load()
    expect(app.themeName.value).toBe('orangeDark')
  })

  it('a malformed stored choice falls back to system + blue', async () => {
    localStorage.setItem('electrical.theme', '{bad')
    const { app } = await load()
    expect(app.themeChoice.value).toEqual({ mode: 'system', palette: 'blue' })
  })
})
