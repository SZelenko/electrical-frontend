/** Stage 5 follow-up: cable label inside the box (fitted), busbar colour (shape, properties, defaults). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { WIRE_COLOUR_HEX, computeLayout } from '@/domain/geometry'
import type { PanelContent, WireColour } from '@/domain/panelContent'
import {
  busbar,
  content,
  element,
  feed,
  id,
  inputCable,
  outputCable,
  rail,
} from '@/domain/__tests__/helpers'
import BusbarShape from '../BusbarShape.vue'
import { mountEditor, stubLayout } from './harness'
import { t } from '@/i18n'
import { choose, selectIn, selectValue } from '@/test/vuetifySelect'

beforeEach(() => {
  stubLayout()
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const dev = (n: number, offset: number) => element(n, offset, 1, 2)
const world = (
  colour: WireColour | null = null,
  label = 'Ввід А',
  outLabel = 'Світло',
): PanelContent => {
  const c = content({
    railWidthModules: 24,
    inputCables: [{ ...inputCable(1, [2, 3]), label }],
    outputCables: [{ ...outputCable(4, [5]), label: outLabel }],
    rails: [
      rail(
        10,
        24,
        150,
        [dev(20, 0), dev(21, 1), dev(22, 2)],
        [],
        [{ ...busbar(60, 'LN', id(20), 3), colour }],
      ),
    ],
  })
  return c
}

describe('cable label inside the box', () => {
  it('input: centred at +170 from the top edge, under the caption at +120', async () => {
    const { wrapper } = await mountEditor(world())
    const l = computeLayout(world())
    const box = l.inputBoxes[0]!
    const mark = wrapper.findAll('[data-testid=cable-mark]')[0]!
    expect(mark.attributes('y')).toBe(String(box.y + 170))
    expect(mark.attributes('x')).toBe(String(box.x + box.w / 2))
    expect(mark.attributes('text-anchor')).toBe('middle')
    const caption = wrapper.findAll('text.cable-label')[0]!
    expect(caption.attributes('y')).toBe(String(box.y + 120))
    expect(Number(mark.attributes('y'))).toBeGreaterThan(Number(caption.attributes('y')))
    expect(Number(mark.attributes('y'))).toBeLessThan(box.y + box.h)
  })

  it('output: label at +170 above the caption at +120 from the bottom edge, inside the box', async () => {
    const { wrapper } = await mountEditor(world())
    const box = computeLayout(world()).outputBoxes[0]!
    const mark = wrapper.findAll('[data-testid=cable-mark]')[1]!
    expect(mark.attributes('y')).toBe(String(box.y + box.h - 170))
    const caption = wrapper.findAll('text.cable-label')[1]!
    expect(caption.attributes('y')).toBe(String(box.y + box.h - 120))
    expect(Number(mark.attributes('y'))).toBeLessThan(Number(caption.attributes('y')))
    expect(Number(mark.attributes('y'))).toBeGreaterThan(box.y)
  })

  it('a short label is not squeezed', async () => {
    const { wrapper } = await mountEditor(world(null, 'Ввід', ''))
    expect(wrapper.findAll('[data-testid=cable-mark]')[0]!.attributes('font-size')).toBe('35')
  })

  it('a long label is scaled down to 1.8 mm, then truncated with an ellipsis; the full text is in a tooltip', async () => {
    const long = 'Щ'.repeat(16)
    const { wrapper } = await mountEditor(world(null, long, long))
    const marks = wrapper.findAll('[data-testid=cable-mark]')
    expect(marks).toHaveLength(2)
    // the drawn text only (the <title> child holds the full text)
    const drawn = (m: (typeof marks)[number]) =>
      [...m.element.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .join('')
    for (const mark of marks) {
      expect(mark.attributes('font-size')).toBe('18')
      expect(mark.find('title').exists()).toBe(false)
    }
    // the full caption and label are in the box tooltip
    const tips = wrapper.findAll('rect.cable-box title').map((x) => x.text())
    expect(tips[0]).toBe(`Вх 1 · ${long} — Вхідний кабель: 230 В / 50 Гц / 4 мм²`)
    expect(tips[1]).toBe(`Вих 1 · ${long} — Вихідний кабель`)
    // room = box length - 2 * CABLE_LABEL_INSET: 120 on the 2-wire input box, 70 on the 1-wire output box
    expect(drawn(marks[0]!)).toBe('Щ'.repeat(10) + '…')
    expect(drawn(marks[1]!)).toBe('Щ'.repeat(5) + '…')
  })

  it('a label that only needs a smaller font is scaled, not cut', async () => {
    const { wrapper } = await mountEditor(world(null, 'Щ'.repeat(8), ''))
    const mark = wrapper.findAll('[data-testid=cable-mark]')[0]!
    expect(mark.text()).toBe('Щ'.repeat(8))
    expect(Number(mark.attributes('font-size'))).toBeLessThan(35)
    expect(Number(mark.attributes('font-size'))).toBeGreaterThanOrEqual(18)
    expect(mark.find('title').exists()).toBe(false)
  })

  it('an empty label draws no mark (error-free empty case)', async () => {
    const { wrapper } = await mountEditor(world(null, '', ''))
    expect(wrapper.find('[data-testid=cable-mark]').exists()).toBe(false)
  })
})

describe('BusbarShape fill', () => {
  const boxFor = (colour: WireColour | null) => computeLayout(world(colour)).busbars.get(id(60))!
  const body = (colour: WireColour | null) =>
    mount(BusbarShape, {
      props: {
        layer: 'body',
        box: boxFor(colour),
        selected: false,
        violation: false,
        handle: false,
      },
      attachTo: document.body,
    })

  it('null is the grey default', () => {
    const w = body(null)
    expect((w.get('[data-testid=busbar]').element as SVGElement).style.fill).toMatch(
      /#cfd4dc|rgb\(207, 212, 220\)/i,
    )
    expect(w.find('.stripes').exists()).toBe(false)
  })

  it.each<[WireColour]>([['black'], ['brown'], ['red'], ['blue']])(
    '%s uses the wire colour',
    (c) => {
      const w = body(c)
      const hex = WIRE_COLOUR_HEX[c]
      const fill = (w.get('[data-testid=busbar]').element as SVGElement).style.fill
      expect(fill.toLowerCase()).toMatch(
        new RegExp(
          `${hex}|rgb\\(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}\\)`,
          'i',
        ),
      )
      expect(w.find('.stripes').exists()).toBe(false)
    },
  )

  it('green-yellow is the green base plus a yellow stripe overlay', () => {
    const w = body('green-yellow')
    const fill = (w.get('[data-testid=busbar]').element as SVGElement).style.fill
    expect(fill).toMatch(/#2e9d3a|rgb\(46, 157, 58\)/i)
    expect(w.find('.stripes').exists()).toBe(true)
  })

  it('feeds keep brown (L) and blue (N) whatever the busbar colour', () => {
    const w = mount(BusbarShape, {
      props: {
        layer: 'contacts',
        box: boxFor('red'),
        selected: false,
        violation: false,
        handle: false,
      },
    })
    const fills = w.findAll('circle:not(.terminal-hit)').map((c) => c.attributes('fill'))
    expect(fills).toEqual([WIRE_COLOUR_HEX.brown, WIRE_COLOUR_HEX.blue])
  })
})

describe('busbar properties: colour', () => {
  const S = 'Властивості шини'
  const open = async (colour: WireColour | null = null) => {
    const m = await mountEditor(world(colour), { properties: true, toolbar: true })
    m.store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    const colourSelect = selectIn(m.wrapper.get(`section[aria-label="${S}"]`), 'Колір')
    return { ...m, colourSelect }
  }
  const colourOf = (c: PanelContent | null) => c?.rails[0]?.busbars[0]?.colour

  it('offers grey plus the five wire colours and shows the stored one', async () => {
    const { colourSelect } = await open('blue')
    expect((colourSelect.props('items') as { title: string }[]).map((i) => i.title)).toEqual([
      'сірий',
      'чорний',
      'коричневий',
      'червоний',
      'синій',
      'жовто-зелений',
    ])
    expect(selectValue(colourSelect)).toBe('blue')
  })

  it('choosing a colour is undoable; going back to grey stores null', async () => {
    const { store, colourSelect } = await open()
    await choose(colourSelect, 'red')
    expect(colourOf(store.content)).toBe('red')
    expect(store.undoLabel && t(store.undoLabel)).toBe('Змінити колір шини')
    await choose(colourSelect, '')
    expect(colourOf(store.content)).toBeNull()
    store.undo()
    expect(colourOf(store.content)).toBe('red')
    store.undo()
    expect(colourOf(store.content)).toBeNull()
    expect(store.canUndo).toBe(false)
    store.redo()
    expect(colourOf(store.content)).toBe('red')
  })

  it('an unknown colour value is rejected and the model is unchanged', async () => {
    const { store, colourSelect } = await open('red')
    await choose(colourSelect, 'pink')
    expect(colourOf(store.content)).toBe('red')
    expect(store.canUndo).toBe(false)
  })

  it('keeps the wires when only the colour changes', async () => {
    const { store, colourSelect } = await open()
    await choose(colourSelect, 'green-yellow')
    expect(store.content?.wires).toEqual([])
    expect(colourOf(store.content)).toBe('green-yellow')
  })
})

describe('wire default colour from a coloured busbar on the canvas', () => {
  it.each<[number, string]>([
    [0, 'brown'],
    [1, 'blue'],
  ])('a wire started on feed %i of a red busbar is %s', async (feedIndex, expected) => {
    const { wrapper, store } = await mountEditor(world('red'))
    const pd = { button: 0, pointerId: 1 }
    await wrapper
      .get(`[data-ep-kind=busbar][data-ep-a="${id(60)}"][data-ep-b="${feedIndex}"]`)
      .trigger('pointerdown', pd)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(feedIndex + 2)}"]`)
      .trigger('pointerdown', pd)
    expect(store.content?.wires).toHaveLength(1)
    expect(store.content?.wires[0]?.colour).toBe(expected)
    expect(store.content?.wires[0]?.start).toEqual(expect.objectContaining(feed(id(60), feedIndex)))
  })
})
