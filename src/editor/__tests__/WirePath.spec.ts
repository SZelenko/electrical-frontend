import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { applyTheme } from '@/appTheme'
import { cw, id, panelWire, pole } from '@/domain/__tests__/helpers'
import {
  GREEN_YELLOW_OVERLAY,
  SHORT_CIRCUIT_HIGHLIGHT,
  WIRE_CASING_EXTRA_MM,
  WIRE_STROKE_MM,
} from '@/domain/geometry'
import WirePath from '../WirePath.vue'

const D = 'M 0 0 L 100 0'

function mountWire(
  props: Partial<InstanceType<typeof WirePath>['$props']> = {},
  patch: Record<string, unknown> = {},
) {
  const wire = { ...panelWire(1, cw(id(2)), pole(id(3), 0, 'input')), ...patch }
  return mount(WirePath, {
    props: {
      wire,
      d: D,
      selected: false,
      shortCircuit: false,
      focused: false,
      violation: false,
      hit: true,
      ...props,
    } as never,
    attachTo: document.body,
  })
}
const paths = (w: ReturnType<typeof mountWire>) => w.findAll('path')
const casing = (w: ReturnType<typeof mountWire>) => w.find('[data-testid=wire-casing]')

beforeEach(() => applyTheme({ mode: 'light', palette: 'blue' }))
afterEach(() => {
  applyTheme({ mode: 'light', palette: 'blue' })
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('WirePath casing', () => {
  it('is not rendered in a light theme', () => {
    const w = mountWire()
    expect(casing(w).exists()).toBe(false)
    expect(paths(w)).toHaveLength(2) // wire + hit stroke
  })

  it('is not rendered in system mode when the OS is light', () => {
    applyTheme({ mode: 'system', palette: 'blue' })
    expect(casing(mountWire()).exists()).toBe(false)
  })

  it('appears when the theme switches to dark and goes when it switches back', async () => {
    const w = mountWire()
    applyTheme({ mode: 'dark', palette: 'blue' })
    await w.vm.$nextTick()
    expect(casing(w).exists()).toBe(true)
    applyTheme({ mode: 'light', palette: 'blue' })
    await w.vm.$nextTick()
    expect(casing(w).exists()).toBe(false)
  })

  it.each(Object.keys(WIRE_STROKE_MM) as (keyof typeof WIRE_STROKE_MM)[])(
    'dark: cross-section %s casing is wire width + the extra, in tenths of mm',
    (cs) => {
      applyTheme({ mode: 'dark', palette: 'green' })
      const w = mountWire({}, { crossSection: cs })
      const wirePath = paths(w).find((p) => p.attributes('stroke')?.startsWith('#'))!
      expect(Number(wirePath.attributes('stroke-width'))).toBeCloseTo(WIRE_STROKE_MM[cs] * 10)
      expect(Number(casing(w).attributes('stroke-width'))).toBeCloseTo(
        (WIRE_STROKE_MM[cs] + WIRE_CASING_EXTRA_MM) * 10,
      )
    },
  )

  it('dark: the casing uses the themed colour, is wider than the wire and ignores the pointer', () => {
    applyTheme({ mode: 'dark', palette: 'blue' })
    const c = casing(mountWire())
    expect((c.element as SVGElement).style.stroke).toBe('var(--schematic-casing)')
    expect(c.attributes('pointer-events')).toBe('none')
    expect(c.attributes('d')).toBe(D)
  })

  it('domain wire colours do not change with the theme', () => {
    const light = mountWire({}, { colour: 'brown' })
    const lightStroke = paths(light)
      .find((p) => p.attributes('stroke')?.startsWith('#'))!
      .attributes('stroke')
    applyTheme({ mode: 'dark', palette: 'blue' })
    const dark = mountWire({}, { colour: 'brown' })
    const darkStroke = paths(dark)
      .find((p) => p.attributes('stroke')?.startsWith('#'))!
      .attributes('stroke')
    expect(darkStroke).toBe(lightStroke)
  })
})

describe('WirePath z-order', () => {
  it('dark: halo, selection, casing, wire, overlay, then the hit stroke', () => {
    applyTheme({ mode: 'dark', palette: 'blue' })
    const w = mountWire({ shortCircuit: true, selected: true }, { colour: 'green-yellow' })
    const ps = paths(w)
    expect(ps).toHaveLength(6)
    expect(ps[0]!.attributes('stroke')).toBe(SHORT_CIRCUIT_HIGHLIGHT.colour)
    expect(ps[1]!.attributes('style')).toContain('--schematic-selection')
    expect(ps[2]!.attributes('data-testid')).toBe('wire-casing')
    expect(ps[3]!.attributes('stroke')).toMatch(/^#/)
    expect(ps[3]!.attributes('stroke-dasharray')).toBeUndefined()
    expect(ps[4]!.attributes('stroke')).toBe(GREEN_YELLOW_OVERLAY.stroke)
    expect(ps[5]!.attributes('data-testid')).toBe('wire')
  })

  it('light: no casing, the order is otherwise the same', () => {
    const w = mountWire({ shortCircuit: true, selected: true }, { colour: 'green-yellow' })
    const ps = paths(w)
    expect(ps).toHaveLength(5)
    expect(ps.map((p) => p.attributes('data-testid') ?? '')).not.toContain('wire-casing')
    expect(ps[0]!.attributes('stroke')).toBe(SHORT_CIRCUIT_HIGHLIGHT.colour)
    expect(ps[2]!.attributes('stroke')).toMatch(/^#/)
    expect(ps[3]!.attributes('stroke')).toBe(GREEN_YELLOW_OVERLAY.stroke)
  })

  it('a violation uses the error colour instead of the selection colour', () => {
    applyTheme({ mode: 'dark', palette: 'blue' })
    const ps = paths(mountWire({ violation: true }))
    expect(ps[0]!.attributes('style')).toContain('--schematic-error')
  })

  it('the halo keeps its fixed domain colour and stays under the casing in a dark theme', () => {
    applyTheme({ mode: 'dark', palette: 'violet' })
    const ps = paths(mountWire({ shortCircuit: true }))
    expect(ps[0]!.attributes('stroke')).toBe('#ff00ff')
    expect(ps[1]!.attributes('data-testid')).toBe('wire-casing')
  })

  it('without hit: no hit stroke is drawn', () => {
    const ps = paths(mountWire({ hit: false }))
    expect(ps).toHaveLength(1)
  })
})
