import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLocale, detectLocale, i18n, LOCALE_STORAGE_KEY, t } from '@/i18n'

function browserLanguage(language: string) {
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(language)
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('uk plural rule (wireCount: one | few | many)', () => {
  it.each([
    [1, '1 провід'],
    [2, '2 проводи'],
    [5, '5 проводів'],
    [11, '11 проводів'],
    [21, '21 провід'],
    [22, '22 проводи'],
    [25, '25 проводів'],
    [0, '0 проводів'],
    [12, '12 проводів'],
    [101, '101 провід'],
    [111, '111 проводів'],
  ])('%i -> %s', (n, text) => {
    expect(t('panels.summary.wireCount', { n })).toBe(text)
  })
})

describe('en plural rule (2 forms)', () => {
  it.each([
    [1, '1 wire'],
    [2, '2 wires'],
    [0, '0 wires'],
    [21, '21 wires'],
  ])('%i -> %s', (n, text) => {
    applyLocale('en')
    expect(t('panels.summary.wireCount', { n })).toBe(text)
  })
})

describe('detectLocale', () => {
  it.each(['uk', 'en'] as const)('prefers the stored choice %s over the browser', (stored) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, stored)
    browserLanguage(stored === 'uk' ? 'de-DE' : 'uk-UA')
    expect(detectLocale()).toBe(stored)
  })

  it('uses uk for a Ukrainian browser (uk-UA and uk)', () => {
    browserLanguage('uk-UA')
    expect(detectLocale()).toBe('uk')
    browserLanguage('uk')
    expect(detectLocale()).toBe('uk')
  })

  it('uses en for any other browser language', () => {
    for (const language of ['de', 'en-US', 'ru-RU', '']) {
      browserLanguage(language)
      expect(detectLocale()).toBe('en')
    }
  })

  it('ignores an unsupported stored value and falls back to the browser language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    browserLanguage('uk-UA')
    expect(detectLocale()).toBe('uk')
    browserLanguage('de')
    expect(detectLocale()).toBe('en')
  })

  it('falls back to the browser language when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    browserLanguage('uk-UA')
    expect(detectLocale()).toBe('uk')
  })
})

describe('applyLocale', () => {
  it('switches the language, remembers it, and updates <html lang> and the title', () => {
    applyLocale('en')
    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Electrical panel builder')
    applyLocale('uk')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('uk')
    expect(document.documentElement.lang).toBe('uk')
    expect(document.title).toBe(t('app.title'))
    expect(document.title).not.toBe('Electrical panel builder')
  })

  it('still switches when storage throws (the choice is just not remembered)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => applyLocale('en')).not.toThrow()
    expect(i18n.global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
