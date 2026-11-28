import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME,
  initialThemeName,
  rememberTheme,
  resolveThemeName,
  storedTheme,
  THEME_MODES,
  THEME_PALETTES,
  THEME_STORAGE_KEY,
  type ThemeName,
} from '@/theme'

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('resolveThemeName', () => {
  const cases = THEME_PALETTES.flatMap((palette) =>
    THEME_MODES.flatMap((mode) =>
      [false, true].map((dark) => {
        const isDark = mode === 'dark' || (mode === 'system' && dark)
        return [mode, palette, dark, `${palette}${isDark ? 'Dark' : 'Light'}`] as const
      }),
    ),
  )
  it.each(cases)('mode %s, palette %s, system dark %s -> %s', (mode, palette, dark, expected) => {
    expect(resolveThemeName({ mode, palette }, dark)).toBe(expected as ThemeName)
  })

  it('covers all 24 combinations', () => {
    expect(cases).toHaveLength(THEME_PALETTES.length * THEME_MODES.length * 2)
  })

  it('the default is system + blue', () => {
    expect(DEFAULT_THEME).toEqual({ mode: 'system', palette: 'blue' })
  })
})

describe('storedTheme', () => {
  const put = (raw: string) => localStorage.setItem(THEME_STORAGE_KEY, raw)

  it('returns a valid stored choice', () => {
    put('{"mode":"dark","palette":"violet"}')
    expect(storedTheme()).toEqual({ mode: 'dark', palette: 'violet' })
  })

  it('round-trips through rememberTheme', () => {
    rememberTheme({ mode: 'light', palette: 'orange' })
    expect(storedTheme()).toEqual({ mode: 'light', palette: 'orange' })
  })

  it('drops unknown extra keys', () => {
    put('{"mode":"dark","palette":"green","x":1}')
    expect(storedTheme()).toEqual({ mode: 'dark', palette: 'green' })
  })

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['malformed JSON', '{mode:'],
    ['plain text', 'dark'],
    ['JSON null', 'null'],
    ['a number', '42'],
    ['a string', '"dark"'],
    ['an array', '["dark","blue"]'],
    ['an unknown mode', '{"mode":"auto","palette":"blue"}'],
    ['an unknown palette', '{"mode":"dark","palette":"pink"}'],
    ['a missing palette', '{"mode":"dark"}'],
    ['a missing mode', '{"palette":"blue"}'],
    ['an empty object', '{}'],
    ['non-string values', '{"mode":1,"palette":2}'],
    ['wrong case', '{"mode":"Dark","palette":"blue"}'],
  ])('returns null for %s', (_name, raw) => {
    if (raw !== null) put(raw)
    expect(storedTheme()).toBeNull()
  })

  it('returns null when reading localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(storedTheme()).toBeNull()
  })

  it('rememberTheme swallows a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => rememberTheme({ mode: 'dark', palette: 'blue' })).not.toThrow()
  })
})

describe('initialThemeName', () => {
  it('uses the stored choice', () => {
    rememberTheme({ mode: 'dark', palette: 'green' })
    expect(initialThemeName()).toBe('greenDark')
  })

  it('falls back to system + blue (light here: matchMedia reports no dark preference)', () => {
    expect(initialThemeName()).toBe('blueLight')
  })

  it('falls back to the default on a malformed stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '{oops')
    expect(initialThemeName()).toBe('blueLight')
  })
})
