/** Stage 5 follow-up: cable label inside the box (fitted), busbar colour (shape, properties, defaults). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import {
  CABLE_LABEL_INPUT_Y,
  CABLE_LABEL_INSET,
  CABLE_LABEL_OUTPUT_Y,
  WIRE_COLOUR_HEX,
  computeLayout,
} from '@/domain/geometry'
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
  it('input: centred at boxY + 130, under the caption at boxY + 80', async () => {
    const { wrapper } = await mountEditor(world())
    const l = computeLayout(world())
    const box = l.inputBoxes[0]!
    const mark = wrapper.findAll('[data-testid=cable-mark]')[0]!
    expect(mark.attributes('y')).toBe(String(box.y + CABLE_LABEL_INPUT_Y))
    expect(mark.attributes('x')).toBe(String(box.x + box.w / 2))
    expect(mark.attributes('text-anchor')).toBe('middle')
    const caption = wrapper.findAll('text.cable-label')[0]!
    expect(caption.attributes('y')).toBe(String(box.y + 80))
    expect(Number(mark.attributes('y'))).toBeGreaterThan(Number(caption.attributes('y')))
    expect(Number(mark.attributes('y'))).toBeLessThan(box.y + box.h)
  })

  it('output: label at boxY + 140 above the caption at boxY + 190, inside the box', async () => {
    const { wrapper } = await mountEditor(world())
    const box = computeLayout(world()).outputBoxes[0]!
    const mark = wrapper.findAll('[data-testid=cable-mark]')[1]!
    expect(mark.attributes('y')).toBe(String(box.y + CABLE_LABEL_OUTPUT_Y))
    const caption = wrapper.findAll('text.cable-label')[1]!
    expect(caption.attributes('y')).toBe(String(box.y + 190))
    expect(Number(mark.attributes('y'))).toBeLessThan(Number(caption.attributes('y')))
    expect(Number(mark.attributes('y'))).toBeGreaterThan(box.y)
  })

  it('a short label is not squeezed', async () => {
    const { wrapper } = await mountEditor(world())
    expect(wrapper.findAll('[data-testid=cable-mark]')[0]!.attributes('textLength')).toBeUndefined()
  })

  it('a long label shrinks to the box width minus the inset (both kinds)', async () => {
    const long = 'Щ'.repeat(16)
    const c = world(null, long, long)
    const { wrapper } = await mountEditor(c)
    const l = computeLayout(c)
    const marks = wrapper.findAll('[data-testid=cable-mark]')
    expect(marks).toHaveLength(2)
    expect(Number(marks[0]!.attributes('textLength'))).toBe(l.inputBoxes[0]!.w - CABLE_LABEL_INSET)
    expect(Number(marks[1]!.attributes('textLength'))).toBe(l.outputBoxes[0]!.w - CABLE_LABEL_INSET)
    expect(marks[0]!.attributes('lengthAdjust')).toBe('spacingAndGlyphs')
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
    const selects = m.wrapper.get(`section[aria-label="${S}"]`).findAll('select')
    return { ...m, colourSelect: selects[1]! }
  }
  const colourOf = (c: PanelContent | null) => c?.rails[0]?.busbars[0]?.colour

  it('offers grey plus the five wire colours and shows the stored one', async () => {
    const { colourSelect } = await open('blue')
    expect(colourSelect.findAll('option').map((o) => o.text())).toEqual([
      'сірий',
      'чорний',
      'коричневий',
      'червоний',
      'синій',
      'жовто-зелений',
    ])
    expect((colourSelect.element as HTMLSelectElement).value).toBe('blue')
  })

  it('choosing a colour is undoable; going back to grey stores null', async () => {
    const { store, colourSelect } = await open()
    await colourSelect.setValue('red')
    expect(colourOf(store.content)).toBe('red')
    expect(store.undoLabel).toBe('Змінити колір шини')
    await colourSelect.setValue('')
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
    const el = colourSelect.element as HTMLSelectElement
    const option = document.createElement('option')
    option.value = 'pink'
    el.appendChild(option)
    await colourSelect.setValue('pink')
    expect(colourOf(store.content)).toBe('red')
    expect(store.canUndo).toBe(false)
  })

  it('keeps the wires when only the colour changes', async () => {
    const { store, colourSelect } = await open()
    await colourSelect.setValue('green-yellow')
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
