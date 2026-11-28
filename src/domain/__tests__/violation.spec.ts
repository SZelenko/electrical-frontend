// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { applyLocale, t } from '@/i18n'
import { violationParameters, violationText } from '../violation'

afterEach(() => applyLocale('uk'))

describe('violationText', () => {
  it.each([
    [
      'uk',
      {
        code: 'value.out_of_range',
        message: 'Must be between 1 and 60.',
        parameters: { min: 1, max: 60 },
      },
      'Значення має бути від 1 до 60.',
    ],
    [
      'en',
      { code: 'value.out_of_range', message: 'x', parameters: { min: 1, max: 60 } },
      'Must be between 1 and 60.',
    ],
    [
      'uk',
      { code: 'value.too_long', message: 'x', parameters: { max: 16 } },
      'Не більше 16 символів.',
    ],
    [
      'en',
      { code: 'value.too_long', message: 'x', parameters: { max: 16 } },
      'Must be at most 16 characters long.',
    ],
    [
      'en',
      { code: 'value.out_of_range', message: 'x', parameters: { min: 0.5, max: 2.5 } },
      'Must be between 0.5 and 2.5.',
    ],
    [
      'en',
      { code: 'device.pole_count', message: 'x', parameters: { max: 4, perModule: 4 } },
      'A device has 1 to 4 poles (at most 4 per module of width).',
    ],
    [
      'en',
      { code: 'busbar.gap', message: 'x', parameters: {} },
      "There are free modules between the busbar's devices.",
    ],
  ])('translates in %s', (locale, violation, expected) => {
    applyLocale(locale as 'uk' | 'en')
    expect(violationText(violation, t)).toBe(expected)
  })

  it('treats [] and {} parameters the same', () => {
    const a = violationText({ code: 'busbar.gap', message: 'm', parameters: [] }, t)
    const b = violationText({ code: 'busbar.gap', message: 'm', parameters: {} }, t)
    const c = violationText({ code: 'busbar.gap', message: 'm' }, t)
    expect(a).toBe('Між апаратами шини є вільні модулі.')
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(violationParameters([])).toEqual({})
    expect(violationParameters(undefined)).toEqual({})
    expect(violationParameters({ max: 3 })).toEqual({ max: 3 })
  })

  it.each([
    ['uk', 'top', 'Не більше 60 клемників у верхньому ряду клемників.'],
    ['uk', 'bottom', 'Не більше 60 клемників у нижньому ряду клемників.'],
    ['en', 'top', 'At most 60 terminal blocks are allowed in the top terminal row.'],
    ['en', 'bottom', 'At most 60 terminal blocks are allowed in the bottom terminal row.'],
  ])('translates the row parameter (%s, %s)', (locale, row, expected) => {
    applyLocale(locale as 'uk' | 'en')
    expect(
      violationText({ code: 'row.too_many_blocks', message: 'm', parameters: { max: 60, row } }, t),
    ).toBe(expected)
  })

  it.each([
    ['elementId,poleIndex,side', 'pole', 'elementId, poleIndex and side'],
    ['cableWireId', 'cableWire', 'cableWireId'],
    ['busbarId,feedIndex', 'busbar', 'busbarId and feedIndex'],
  ])('turns endpoint.shape fields %s into a natural list (en)', (fields, kind, list) => {
    applyLocale('en')
    const text = violationText(
      { code: 'endpoint.shape', message: 'm', parameters: { kind, fields } },
      t,
    )
    expect(text).toContain(list)
    expect(text).toContain(kind)
    expect(text).not.toContain(',poleIndex')
  })

  it('joins the endpoint.shape fields with the Ukrainian conjunction', () => {
    const text = violationText(
      { code: 'endpoint.shape', message: 'm', parameters: { kind: 'pole', fields: 'a,b,c' } },
      t,
    )
    expect(text).toContain('a, b та c')
  })

  it('falls back to the English message for an unknown code', () => {
    expect(
      violationText({ code: 'no.such_code', message: 'Server says no.', parameters: {} }, t),
    ).toBe('Server says no.')
    applyLocale('en')
    expect(violationText({ code: 'no.such_code', message: 'Server says no.' }, t)).toBe(
      'Server says no.',
    )
  })

  it('falls back to the message for an empty code (a violation without a code)', () => {
    expect(violationText({ code: '', message: 'Plain message' }, t)).toBe('Plain message')
  })
})
