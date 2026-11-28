// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { applyLocale, t } from '@/i18n'
import { formatInputCableLabel } from '../panelContent'

afterEach(() => applyLocale('uk'))

describe('numbers in messages follow the locale', () => {
  it.each([
    ['uk', 2.5, '2,5'],
    ['en', 2.5, '2.5'],
    ['uk', 4, '4'],
    ['en', 1.5, '1.5'],
    ['uk', 1000, '1000'], // no grouping separators
  ] as const)('%s formats %d as %s in a parameter', (locale, value, expected) => {
    applyLocale(locale)
    expect(t('violations.value.too_small', { min: value })).toContain(expected)
  })

  it('does not format the plural count n (it selects the form)', () => {
    expect(t('panels.summary.wireCount', { n: 5 })).toBe('5 проводів')
  })
})

describe('formatInputCableLabel (rating units)', () => {
  const cable = { voltage: 230, frequency: 50, crossSection: 2.5 }

  it('uses Ukrainian units and a decimal comma in uk', () => {
    expect(formatInputCableLabel(cable, t)).toBe('230 В / 50 Гц / 2,5 мм²')
  })

  it('uses Latin units and a decimal point in en', () => {
    applyLocale('en')
    expect(formatInputCableLabel(cable, t)).toBe('230 V / 50 Hz / 2.5 mm²')
  })

  it('formats a whole cross-section without decimals', () => {
    expect(formatInputCableLabel({ ...cable, crossSection: 4 }, t)).toBe('230 В / 50 Гц / 4 мм²')
  })
})
