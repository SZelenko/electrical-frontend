/** Cable boxes: icon per kind/load, kind classes, text fitting and the tooltip only when truncated. */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { applyLocale, i18n } from '@/i18n'
import { vuetify } from '@/plugins/vuetify'
import { CABLE_DOT_R, CABLE_DOT_STROKE, CABLE_HIT_R } from '@/domain/cableBoxContent'
import { computeLayout } from '@/domain/geometry'
import type { OutputLoad, PanelContent } from '@/domain/panelContent'
import { content, inputCable, outputCable } from '@/domain/__tests__/helpers'
import CableRow from '../CableRow.vue'

afterEach(() => {
  applyLocale('uk')
  i18n.global.locale.value = 'uk'
})

const render = (c: PanelContent, layer: 'body' | 'contacts' = 'body') => {
  const l = computeLayout(c)
  return mount(CableRow, {
    props: {
      layer,
      boxes: [...l.inputBoxes, ...l.outputBoxes],
      selectedId: null,
      violationIds: new Set<string>(),
      titles: {},
    },
  })
}

const panel = (over: Partial<PanelContent> = {}, load: OutputLoad = 'socket') =>
  content({
    railWidthModules: 24,
    inputCableSide: 'top',
    outputCableSide: 'bottom',
    inputCables: [inputCable(1, [2, 3])],
    outputCables: [{ ...outputCable(4, [5]), load }],
    ...over,
  })

describe('CableRow: icons', () => {
  it('an input cable shows the lightning icon, an output the icon of its load', () => {
    const icons = (load: OutputLoad) =>
      render(panel({}, load))
        .findAll('[data-testid=cable-icon]')
        .map((i) => i.attributes('data-icon'))
    expect(icons('socket')).toEqual(['flash', 'socket'])
    expect(icons('lighting')).toEqual(['flash', 'lighting'])
  })

  it('socket and lighting draw different shapes; the input shape differs from both', () => {
    const d = (load: OutputLoad) =>
      render(panel({}, load))
        .findAll('[data-testid=cable-icon]')
        .map((i) => i.attributes('d'))
    const socket = d('socket')
    const lighting = d('lighting')
    expect(socket[0]).toBe(lighting[0]) // the input icon is the same
    expect(socket[1]).not.toBe(lighting[1])
    expect(socket[0]).not.toBe(socket[1])
    expect(socket.every((p) => !!p && p.length > 10)).toBe(true)
  })

  it('has no icon on the contacts layer', () => {
    expect(render(panel(), 'contacts').findAll('[data-testid=cable-icon]')).toHaveLength(0)
  })

  it.each(['top', 'bottom', 'left', 'right'] as const)(
    'the icon is centred along the %s box and scaled to the 5 mm square',
    (side) => {
      const c = panel({ inputCableSide: side, outputCableSide: side === 'top' ? 'bottom' : 'top' })
      const l = computeLayout(c)
      const box = l.inputBoxes[0]!
      const icon = render(c).findAll('[data-testid=cable-icon]')[0]!
      const transform = icon.attributes('transform')!
      expect(transform).toMatch(/scale\(2\.0833/) // 50 u / 24 units
      const horizontal = side === 'top' || side === 'bottom'
      const m = /translate\(([\d.]+) ([\d.]+)\)/.exec(transform)!
      expect(Number(horizontal ? m[1] : m[2])).toBe(
        horizontal ? box.x + box.w / 2 : box.y + box.h / 2,
      )
      expect(transform.includes('rotate(-90)')).toBe(!horizontal)
    },
  )
})

describe('CableRow: kind classes', () => {
  it('boxes and icons carry the input / output class', () => {
    const w = render(panel())
    const boxes = w.findAll('rect.cable-box')
    expect(boxes.map((b) => [b.classes('input'), b.classes('output')])).toEqual([
      [true, false],
      [false, true],
    ])
    const icons = w.findAll('path.cable-icon')
    expect(icons.map((b) => [b.classes('input'), b.classes('output')])).toEqual([
      [true, false],
      [false, true],
    ])
  })

  it('the classes do not depend on the side', () => {
    const w = render(panel({ inputCableSide: 'left', outputCableSide: 'left' }))
    expect(w.findAll('rect.cable-box').map((b) => b.classes())).toEqual([
      expect.arrayContaining(['input']),
      expect.arrayContaining(['output']),
    ])
  })
})

describe('CableRow: caption and label fitting', () => {
  const one = (label: string, wires: number[] = [2]) =>
    render(panel({ inputCables: [{ ...inputCable(1, wires), label }], outputCables: [] }))

  it('a short label is drawn at 3.5 mm without a tooltip', () => {
    const w = one('Мережа', [2, 3, 4, 5]) // room 220
    const mark = w.get('[data-testid=cable-mark]')
    expect(mark.text()).toBe('Мережа')
    expect(mark.attributes('font-size')).toBe('35')
    expect(mark.find('title').exists()).toBe(false)
  })

  it('a long label is scaled down and still has no tooltip while it fits', () => {
    const w = one('1234567890123456', [2, 3, 4, 5]) // 16 chars in 220 -> 22
    const mark = w.get('[data-testid=cable-mark]')
    expect(mark.attributes('font-size')).toBe('22')
    expect(mark.text()).toBe('1234567890123456')
    expect(mark.find('title').exists()).toBe(false)
  })

  it('a label that does not fit even at 1.8 mm is cut with an ellipsis and is not repeated in a title (the box tooltip holds it)', () => {
    const w = one('1234567890123456') // 1 wire: room 70
    const mark = w.get('[data-testid=cable-mark]')
    expect(mark.attributes('font-size')).toBe('18')
    expect(mark.find('title').exists()).toBe(false)
    expect(mark.text()).toContain('…')
    expect(mark.text().length).toBeLessThan(16)
  })

  it('no label means no label text at all', () => {
    expect(one('').findAll('[data-testid=cable-mark]')).toHaveLength(0)
  })

  it('the caption of a fitting box has no title; the box rect always has its own title', () => {
    const l = computeLayout(panel())
    const w = mount(CableRow, {
      props: {
        layer: 'body',
        boxes: l.inputBoxes,
        selectedId: null,
        violationIds: new Set<string>(),
        titles: { [l.inputBoxes[0]!.id]: 'Вхідний кабель 1' },
      },
    })
    const caption = w.findAll('text').find((t) => t.text() === 'Вх 1')!
    expect(caption.find('title').exists()).toBe(false)
    expect(w.get('rect.cable-box title').text()).toBe('Вхідний кабель 1')
  })

  it('the caption follows the locale', () => {
    applyLocale('en')
    const w = render(panel())
    expect(w.findAll('text').map((t) => t.text())).toEqual(
      expect.arrayContaining(['In 1', 'Out 1']),
    )
  })
})

describe('CableRow: wire points', () => {
  it('draw dots of radius <= 18 and hit areas of radius <= 25', () => {
    const w = render(panel(), 'contacts')
    const radii = w.findAll('circle').map((c) => Number(c.attributes('r')))
    // the dot is r = CABLE_DOT_R - CABLE_DOT_STROKE / 2 plus the stroke: a visual radius of CABLE_DOT_R
    expect(new Set(radii)).toEqual(new Set([CABLE_DOT_R - CABLE_DOT_STROKE / 2, CABLE_HIT_R]))
    expect(Math.max(...radii)).toBeLessThanOrEqual(25)
    expect(w.findAll('circle.terminal-hit')).toHaveLength(3)
  })

  it('neighbouring hit areas of a box do not overlap (5 mm pitch)', () => {
    const w = render(
      panel({ inputCables: [inputCable(1, [2, 3, 4, 5])], outputCables: [] }),
      'contacts',
    )
    const xs = w
      .findAll('circle.terminal-hit')
      .map((c) => Number(c.attributes('cx')))
      .sort((a, b) => a - b)
    expect(xs).toHaveLength(4)
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]! - xs[i - 1]! - 2 * CABLE_HIT_R).toBeGreaterThanOrEqual(0)
  })
})

describe('theme colours of the cable boxes', () => {
  it('every theme defines the input and output stroke and fill', () => {
    const themes = vuetify.theme.themes.value
    const names = Object.keys(themes).filter((n) => /(Light|Dark)$/.test(n))
    expect(names).toHaveLength(8)
    for (const name of names) {
      const colours = themes[name]!.colors as Record<string, string>
      for (const key of [
        'schematic-input',
        'schematic-input-fill',
        'schematic-output',
        'schematic-output-fill',
      ]) {
        expect(colours[key], `${name} ${key}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
      expect(colours['schematic-input']).not.toBe(colours['schematic-output'])
      expect(colours['schematic-input-fill']).not.toBe(colours['schematic-output-fill'])
    }
  })
})
