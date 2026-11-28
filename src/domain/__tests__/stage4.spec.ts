/** Stage 4: device styles and switching on the element. Success + Error per behaviour. */
import { describe, expect, it } from 'vitest'
import { InvalidPayloadError, contentToPayload, normalizeContent } from '@/api/panels'
import { copyItem, toggleElement, updateElement } from '../commands'
import { t } from '@/i18n'
import { DEVICE_STYLE_DEFAULTS, newDevice } from '../deviceStyles'
import type { AtsState, DeviceStyle, PanelContent } from '../panelContent'
import { checkShortCircuits } from '../shortCircuit'
import { validateContent } from '../validateContent'
import {
  addAuto,
  ats,
  content,
  cw,
  element,
  id,
  inputCable,
  pole,
  rail,
  rejection,
  run,
} from './helpers'

const STYLES: DeviceStyle[] = ['breaker', 'rcd', 'voltageRelay']

describe('newDevice defaults per style', () => {
  it.each([
    ['breaker', 1, [false], 'Автомат'],
    ['rcd', 2, [false, false], 'ПЗВ'],
    ['voltageRelay', 2, [false, true], 'Реле напруги'],
  ] as const)('%s: %i modules, transit flags %j, title %s', (style, width, transit, title) => {
    const d = newDevice(style, id(20), 3)
    expect(d).toEqual({
      kind: 'device',
      style,
      id: id(20),
      offsetModules: 3,
      widthModules: width,
      label: '',
      marking: '',
      sidesSwapped: false,
      on: true,
      poles: transit.map((t) => ({ transit: t })),
      state: null,
    })
    expect(t(DEVICE_STYLE_DEFAULTS[style].titleKey)).toBe(title)
  })

  it('every default satisfies the 4-poles-per-module rule and the client validator', () => {
    for (const style of STYLES) {
      const d = newDevice(style, id(20), 0)
      expect(d.poles.length).toBeLessThanOrEqual(4 * d.widthModules)
      expect(validateContent(content({ rails: [rail(10, 24, 150, [d])] }))).toEqual([])
    }
  })

  it('creates independent pole objects (no shared state between devices)', () => {
    const a = newDevice('rcd', id(20), 0)
    const b = newDevice('rcd', id(21), 2)
    a.poles[0]!.transit = true
    expect(b.poles[0]!.transit).toBe(false)
    expect(DEVICE_STYLE_DEFAULTS.rcd.poles).toEqual([false, false])
  })
})

describe('updateElement style', () => {
  const dev = element(20, 0, 3, 2, {
    on: false,
    label: 'Q',
    marking: 'M',
    poles: [{ transit: true }, { transit: false }],
  })
  const c0 = content({ rails: [rail(10, 24, 150, [dev, ats(21, 4, 2)])] })

  it.each(STYLES)('switches to %s and keeps width, poles, on/off, label and marking', (style) => {
    const out = run(
      c0,
      updateElement(id(20), { style: style === 'breaker' ? 'rcd' : style }),
    ).content
    const e = out.rails[0]!.elements[0]!
    expect(e).toMatchObject({
      kind: 'device',
      style: style === 'breaker' ? 'rcd' : style,
      widthModules: 3,
      on: false,
      label: 'Q',
      marking: 'M',
      poles: [{ transit: true }, { transit: false }],
    })
  })

  it('the same style returns the same content', () => {
    expect(run(c0, updateElement(id(20), { style: 'breaker' })).content).toBe(c0)
  })

  it('a style change keeps the attached wires untouched', () => {
    const c = run(c0, addAuto(30, cw(id(2)), pole(id(20), 0, 'input'))).content
    const out = run(c, updateElement(id(20), { style: 'voltageRelay' })).content
    expect(out.wires).toBe(c.wires)
  })

  it('an unknown style is invalid', () => {
    expect(updateElement(id(20), { style: 'fuse' as DeviceStyle })(c0)).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'style',
    })
  })

  it('an ATS rejects a style (kind never changes)', () => {
    expect(updateElement(id(21), { style: 'rcd' })(c0)).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'kind',
    })
  })

  it('an unknown element is notFound', () => {
    expect(rejection(updateElement(id(99), { style: 'rcd' })(c0))).toBe('notFound')
  })
})

describe('toggleElement', () => {
  const c0 = content({
    inputCables: [inputCable(1, [2, 3])],
    rails: [
      rail(10, 24, 150, [element(20, 0, 1, 1), ats(21, 4, 2), element(22, 8, 1, 1, { on: false })]),
    ],
  })
  const el = (c: PanelContent, n: number) => c.rails[0]!.elements.find((e) => e.id === id(n))!

  it('a device flips on -> off -> on, one command each', () => {
    const off = run(c0, toggleElement(id(20))).content
    expect(el(off, 20)).toMatchObject({ on: false })
    const on = run(off, toggleElement(id(20))).content
    expect(el(on, 20)).toMatchObject({ on: true })
  })

  it('a device that is off turns on', () => {
    expect(el(run(c0, toggleElement(id(22))).content, 22)).toMatchObject({ on: true })
  })

  it.each([
    ['A', 'off'],
    ['off', 'B'],
    ['B', 'A'],
  ] as [AtsState, AtsState][])('an ATS in state %s goes to %s', (from, to) => {
    const c = run(c0, updateElement(id(21), { state: from })).content
    expect(el(run(c, toggleElement(id(21))).content, 21)).toMatchObject({ state: to })
  })

  it('three toggles bring an ATS back to A', () => {
    let c = c0
    for (let i = 0; i < 3; i++) c = run(c, toggleElement(id(21))).content
    expect(el(c, 21)).toMatchObject({ state: 'A' })
  })

  it('only the target changes; other elements and wires keep their references', () => {
    const w = run(c0, addAuto(30, cw(id(2)), pole(id(20), 0, 'input'))).content
    const out = run(w, toggleElement(id(20))).content
    expect(out.wires).toBe(w.wires)
    expect(out.rails[0]!.elements[1]).toBe(w.rails[0]!.elements[1])
    expect(out.rails[0]!.elements[0]).not.toBe(w.rails[0]!.elements[0])
  })

  it('an unknown id is notFound', () => {
    expect(rejection(toggleElement(id(99))(c0))).toBe('notFound')
  })

  it('does not mutate the input content', () => {
    const snapshot = structuredClone(c0)
    toggleElement(id(20))(c0)
    expect(c0).toEqual(snapshot)
  })

  it('switching a breaker off removes the short circuit it carried, on brings it back', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [element(20, 0, 1, 1)])],
    })
    const wired = run(
      run(c, addAuto(30, cw(id(2)), pole(id(20), 0, 'input'))).content,
      addAuto(31, pole(id(20), 0, 'output'), cw(id(3))),
    ).content
    expect(checkShortCircuits(wired)).toHaveLength(1)
    const off = run(wired, toggleElement(id(20))).content
    expect(checkShortCircuits(off)).toEqual([])
    expect(checkShortCircuits(run(off, toggleElement(id(20))).content)).toHaveLength(1)
  })

  it('an ATS cycle A -> off -> B changes the short-circuit count (1, 0, 0)', () => {
    const base = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [ats(21, 0, 2)])],
    })
    let c = run(base, addAuto(30, cw(id(2)), pole(id(21), 0, 'input'))).content
    c = run(c, addAuto(31, cw(id(3)), pole(id(21), 2, 'input'))).content
    c = run(c, addAuto(32, pole(id(21), 0, 'output'), pole(id(21), 2, 'input'))).content
    expect(checkShortCircuits(c)).toHaveLength(1) // A: out0 is fed by in0, wired to in2
    c = run(c, toggleElement(id(21))).content // off
    expect(checkShortCircuits(c)).toHaveLength(0)
    c = run(c, toggleElement(id(21))).content // B
    expect(checkShortCircuits(c)).toHaveLength(0)
    c = run(c, toggleElement(id(21))).content // A again
    expect(checkShortCircuits(c)).toHaveLength(1)
  })
})

describe('copyItem carries the style', () => {
  it.each(STYLES)('a %s copy keeps its style, poles and width', (style) => {
    const d = { ...newDevice(style, id(20), 0), on: false }
    const c = content({ rails: [rail(10, 24, 150, [d]), rail(11)] })
    const out = run(c, copyItem(id(20), id(70), { railId: id(11) }, 2)).content
    expect(out.rails[1]!.elements[0]).toEqual({ ...d, id: id(70), offsetModules: 2 })
  })

  it('an ATS copy keeps style null', () => {
    const c = content({ rails: [rail(10, 24, 150, [ats(21, 0, 2)]), rail(11)] })
    expect(
      run(c, copyItem(id(21), id(70), { railId: id(11) }, 0)).content.rails[1]!.elements[0],
    ).toMatchObject({
      kind: 'ats',
      style: null,
    })
  })
})

describe('validateContent style rules', () => {
  const paths = (c: PanelContent) => validateContent(c).map((v) => v.propertyPath)
  const messages = (c: PanelContent) => validateContent(c).map((v) => v.message)
  const withEl = (e: unknown) => content({ rails: [rail(10, 24, 150, [e as never])] })

  it.each(STYLES)('accepts a device of style %s', (style) => {
    expect(validateContent(withEl(element(20, 0, 2, 2, { style })))).toEqual([])
  })

  it('accepts an ATS with style null', () => {
    expect(validateContent(withEl(ats(21, 0, 2)))).toEqual([])
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an unknown name', 'fuse'],
    ['an empty string', ''],
  ])('rejects a device whose style is %s at ...elements[0].style', (_n, style) => {
    const c = withEl({ ...element(20, 0, 2, 2), style })
    expect(paths(c)).toContain('content.rails[0].elements[0].style')
    expect(messages(c)).toContain('Required for a device.')
  })

  it('rejects an ATS that carries a style', () => {
    const c = withEl({ ...ats(21, 0, 2), style: 'breaker' })
    expect(paths(c)).toContain('content.rails[0].elements[0].style')
    expect(messages(c)).toContain('Must be null for an ATS.')
  })

  it('reports the style path of the right element', () => {
    const c = content({
      rails: [
        rail(10, 24, 150, [element(20, 0, 1, 1), { ...element(21, 2, 1, 1), style: 'x' } as never]),
      ],
    })
    expect(paths(c)).toEqual(['content.rails[0].elements[1].style'])
  })
})

describe('style in the API payload', () => {
  const payloadWith = (style: unknown, kind: 'device' | 'ats' = 'device') => {
    const c = content({
      rails: [rail(10, 24, 150, kind === 'device' ? [element(20, 0, 1, 1)] : [ats(21, 0, 2)])],
    })
    const p = structuredClone(contentToPayload(c)) as unknown as {
      rails: { elements: Record<string, unknown>[] }[]
    }
    p.rails[0]!.elements[0]!.style = style
    return p as unknown as Parameters<typeof normalizeContent>[0]
  }

  it.each(STYLES)('contentToPayload sends style %s for a device and null for an ATS', (style) => {
    const c = content({
      rails: [rail(10, 24, 150, [element(20, 0, 1, 1, { style }), ats(21, 4, 2)])],
    })
    const els = contentToPayload(c).rails![0]!.elements!
    expect(els.map((e) => e.style)).toEqual([style, null])
  })

  it.each(STYLES)('normalizeContent reads style %s', (style) => {
    expect(normalizeContent(payloadWith(style)).rails[0]!.elements[0]).toMatchObject({ style })
  })

  it('a device without a style is an invalid payload (error)', () => {
    expect(() => normalizeContent(payloadWith(undefined))).toThrow(InvalidPayloadError)
    expect(() => normalizeContent(payloadWith(null))).toThrow(InvalidPayloadError)
  })

  it('an ATS keeps style null; a style on an ATS is kept for the validator to report', () => {
    expect(normalizeContent(payloadWith(null, 'ats')).rails[0]!.elements[0]).toMatchObject({
      style: null,
    })
    const c = normalizeContent(payloadWith('rcd', 'ats'))
    expect(validateContent(c).map((v) => v.propertyPath)).toContain(
      'content.rails[0].elements[0].style',
    )
  })

  it('every style survives editor -> payload -> editor', () => {
    const c = content({
      rails: [
        rail(
          10,
          24,
          150,
          STYLES.map((style, i) => element(20 + i, i * 3, 2, 2, { style })),
        ),
      ],
    })
    expect(normalizeContent(contentToPayload(c))).toEqual(c)
  })
})
