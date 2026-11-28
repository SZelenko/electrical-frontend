/** Stage 4: device style shapes, on-element switching, toolbar defaults and the style select. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { setPoleTransit, updateElement } from '@/domain/commands'
import { computeLayout } from '@/domain/geometry'
import { DEVICE_STYLES } from '@/domain/limits'
import type { DeviceStyle, PanelContent } from '@/domain/panelContent'
import {
  addAuto,
  ats,
  block,
  content,
  cw,
  id,
  inputCable,
  pole,
  rail,
} from '@/domain/__tests__/helpers'
import { newDevice } from '@/domain/deviceStyles'
import { deviceShapes } from '../shapes/registry'
import { mountEditor, pointer, stubLayout } from './harness'
import { t } from '@/i18n'
import { choose, selectDisabled, selectIn, selectValue } from '@/test/vuetifySelect'

/** R1 id10: breaker id20 [0,1), RCD id21 [2,4), relay id22 [5,7) (pole 2 transit), ATS id23 [8,10); R2 id11 empty. */
const base: PanelContent = content({
  inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
  rails: [
    rail(10, 24, 150, [
      newDevice('breaker', id(20), 0),
      newDevice('rcd', id(21), 2),
      newDevice('voltageRelay', id(22), 5),
      ats(23, 8, 2),
    ]),
    rail(11, 24, 100),
  ],
})
const layout = computeLayout(base)
const centreOf = (n: number) => {
  const b = layout.elements.get(id(n))!
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}
type Wrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']
const toggle = (w: Wrapper, n: number) => w.get(`[data-testid=toggle][data-id="${id(n)}"]`)
const body = (w: Wrapper, n: number) => w.get(`[data-testid=element][data-id="${id(n)}"]`)
const CTRL = { ctrlKey: true }
const el = (c: PanelContent | null, n: number) =>
  c!.rails.flatMap((r) => r.elements).find((e) => e.id === id(n))!

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function historyLength(store: { undo: () => string | null }): number {
  let n = 0
  while (store.undo() !== null) n++
  return n
}

/** A click on the toggle zone: pointerdown and pointerup at the same point. */
async function clickToggle(w: Wrapper, n: number, mods: object = {}) {
  const at = centreOf(n)
  await toggle(w, n).trigger('pointerdown', pointer(w, at, mods))
  await w.get('svg.canvas').trigger('pointerup', pointer(w, at, mods))
}

describe('style registry and shapes', () => {
  it('has exactly one distinct component per device style', () => {
    expect(Object.keys(deviceShapes).sort()).toEqual([...DEVICE_STYLES].sort())
    expect(new Set(Object.values(deviceShapes)).size).toBe(DEVICE_STYLES.length)
  })

  it.each([
    [20, 'breaker'],
    [21, 'rcd'],
    [22, 'voltageRelay'],
  ])('element %i renders the %s shape', async (n, style) => {
    const { wrapper } = await mountEditor(base)
    expect(body(wrapper, n).attributes('data-element-style')).toBe(style)
    expect(body(wrapper, n).attributes('data-element-kind')).toBeUndefined()
  })

  it('the ATS has its own shape without a device style', async () => {
    const { wrapper } = await mountEditor(base)
    expect(body(wrapper, 23).attributes('data-element-kind')).toBe('ats')
    expect(body(wrapper, 23).attributes('data-element-style')).toBeUndefined()
  })

  it('every element has exactly one toggle zone', async () => {
    const { wrapper } = await mountEditor(base)
    expect(wrapper.findAll('[data-testid=toggle]')).toHaveLength(4)
    for (const n of [20, 21, 22, 23]) {
      expect(wrapper.findAll(`[data-testid=toggle][data-id="${id(n)}"]`)).toHaveLength(1)
    }
  })

  it.each([
    [20, 'Перемкнути автомат (зараз: увімкнено)', 'Перемкнути автомат (зараз: вимкнено)'],
    [21, 'Перемкнути ПЗВ (зараз: увімкнено)', 'Перемкнути ПЗВ (зараз: вимкнено)'],
    [22, 'Перемкнути реле напруги (зараз: увімкнено)', 'Перемкнути реле напруги (зараз: вимкнено)'],
  ])('toggle %i: role button and aria-label follow the state', async (n, onLabel, offLabel) => {
    const { wrapper, store } = await mountEditor(base)
    const t = toggle(wrapper, n)
    expect(t.attributes('role')).toBe('button')
    expect(t.attributes('aria-label')).toBe(onLabel)
    await clickToggle(wrapper, n)
    await nextTick()
    expect(toggle(wrapper, n).attributes('aria-label')).toBe(offLabel)
    expect(el(store.content, n)).toMatchObject({ on: false })
  })

  it('the ATS toggle label names the state (А, 0, Б)', async () => {
    const { wrapper } = await mountEditor(base)
    const labels: string[] = [toggle(wrapper, 23).attributes('aria-label')!]
    for (let i = 0; i < 3; i++) {
      await clickToggle(wrapper, 23)
      await nextTick()
      labels.push(toggle(wrapper, 23).attributes('aria-label')!)
    }
    expect(labels).toEqual([
      'Перемкнути АВР (стан: А)',
      'Перемкнути АВР (стан: 0)',
      'Перемкнути АВР (стан: Б)',
      'Перемкнути АВР (стан: А)',
    ])
  })

  it('the voltage relay display shows 220 when on and --- when off', async () => {
    const { wrapper } = await mountEditor(base)
    const display = () => body(wrapper, 22).element.parentElement!.textContent
    expect(display()).toContain('220')
    expect(display()).not.toContain('---')
    await clickToggle(wrapper, 22)
    await nextTick()
    expect(display()).toContain('---')
    expect(display()).not.toContain('220')
  })

  it('the breaker lever shows I when on and O when off', async () => {
    const { wrapper } = await mountEditor(base)
    const glyph = () =>
      body(wrapper, 20).element.parentElement!.querySelector('.glyph')!.textContent!.trim()
    expect(glyph()).toBe('I')
    await clickToggle(wrapper, 20)
    await nextTick()
    expect(glyph()).toBe('O')
  })

  it('the ATS handle indicator follows the state through A, off, B', async () => {
    const { wrapper } = await mountEditor(base)
    const state = () => wrapper.get('[data-testid=ats-state]').attributes('data-state')
    const seen = [state()]
    for (let i = 0; i < 3; i++) {
      await clickToggle(wrapper, 23)
      await nextTick()
      seen.push(state())
    }
    expect(seen).toEqual(['A', 'off', 'B', 'A'])
  })

  it('a transit pole gets a mark at its top and bottom terminal; a plain pole gets none', async () => {
    const { wrapper } = await mountEditor(base)
    const marks = (n: number) =>
      body(wrapper, n).element.parentElement!.querySelectorAll('.transit-mark').length
    expect(marks(20)).toBe(0)
    expect(marks(21)).toBe(0)
    expect(marks(22)).toBe(2) // relay pole 2 is transit: one mark per terminal
    expect(
      wrapper
        .find('[data-testid=ats-state]')
        .element.parentElement!.querySelectorAll('.transit-mark'),
    ).toHaveLength(0)
  })

  it('marking a pole transit adds its marks and clearing removes them', async () => {
    const { wrapper, store } = await mountEditor(base)
    const marks = () =>
      body(wrapper, 21).element.parentElement!.querySelectorAll('.transit-mark').length
    store.apply(setPoleTransit(id(21), 0, true), 'editor.history.addRail')
    await nextTick()
    expect(marks()).toBe(2)
    store.apply(setPoleTransit(id(21), 1, true), 'editor.history.addRail')
    await nextTick()
    expect(marks()).toBe(4)
    store.apply(setPoleTransit(id(21), 0, false), 'editor.history.addRail')
    store.apply(setPoleTransit(id(21), 1, false), 'editor.history.addRail')
    await nextTick()
    expect(marks()).toBe(0)
  })

  it('a style change swaps the shape and keeps the element', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(updateElement(id(20), { style: 'rcd' }), 'editor.history.addRail')
    await nextTick()
    expect(body(wrapper, 20).attributes('data-element-style')).toBe('rcd')
    expect(wrapper.findAll(`[data-testid=toggle][data-id="${id(20)}"]`)).toHaveLength(1)
  })

  it('the label and marking appear on the front panel', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(updateElement(id(20), { label: 'Q1', marking: 'C16' }), 'editor.history.addRail')
    await nextTick()
    const text = body(wrapper, 20).element.parentElement!.textContent!
    expect(text).toContain('Q1')
    expect(text).toContain('C16')
  })
})

describe('click, drag and Ctrl+drag on the toggle zone', () => {
  it('a click toggles a device: one entry "Перемкнути", the element is selected, undo restores', async () => {
    const { wrapper, store } = await mountEditor(base)
    await clickToggle(wrapper, 20)
    expect(el(store.content, 20)).toMatchObject({ on: false })
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перемкнути')
    expect(historyLength(store)).toBe(1)
    expect(el(store.content, 20)).toMatchObject({ on: true })
  })

  it('a click on an ATS cycles A, off, B, A with one entry each', async () => {
    const { wrapper, store } = await mountEditor(base)
    const states: string[] = []
    for (let i = 0; i < 3; i++) {
      await clickToggle(wrapper, 23)
      states.push((el(store.content, 23) as { state: string }).state)
    }
    expect(states).toEqual(['off', 'B', 'A'])
    expect(historyLength(store)).toBe(3)
  })

  it('a movement under 4 px is still a click and toggles', async () => {
    const { wrapper, store } = await mountEditor(base)
    const at = centreOf(20)
    await toggle(wrapper, 20).trigger('pointerdown', pointer(wrapper, at))
    await wrapper
      .get('svg.canvas')
      .trigger('pointermove', pointer(wrapper, { x: at.x + 20, y: at.y })) // 2 px
    await wrapper
      .get('svg.canvas')
      .trigger('pointerup', pointer(wrapper, { x: at.x + 20, y: at.y }))
    expect(el(store.content, 20)).toMatchObject({ on: false })
    expect(historyLength(store)).toBe(1)
  })

  it('dragging from the toggle zone moves the element and does not toggle it', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(20)
    const to = { x: from.x + 12 * 175, y: from.y }
    await toggle(wrapper, 20).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg.canvas').trigger('pointermove', pointer(wrapper, to))
    await wrapper.get('svg.canvas').trigger('pointerup', pointer(wrapper, to))
    expect(el(store.content, 20)).toMatchObject({ on: true, offsetModules: 12 })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перемістити апарат')
    expect(historyLength(store)).toBe(1)
  })

  it('dragging the ATS handle moves the ATS and keeps its state', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(23)
    const to = { x: from.x + 6 * 175, y: from.y }
    await toggle(wrapper, 23).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg.canvas').trigger('pointermove', pointer(wrapper, to))
    await wrapper.get('svg.canvas').trigger('pointerup', pointer(wrapper, to))
    expect(el(store.content, 23)).toMatchObject({ state: 'A', offsetModules: 14 })
  })

  it('Ctrl+drag from the toggle zone copies the element (the copy has the same on/off) and toggles nothing', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(20)
    const to = { x: from.x, y: layout.rails[1]!.cy }
    await toggle(wrapper, 20).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg.canvas').trigger('pointermove', pointer(wrapper, to, CTRL))
    await wrapper.get('svg.canvas').trigger('pointerup', pointer(wrapper, to, CTRL))
    expect(el(store.content, 20)).toMatchObject({ on: true })
    const copy = store.content!.rails[1]!.elements[0]!
    expect(copy).toMatchObject({ style: 'breaker', on: true })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Копіювати')
    expect(historyLength(store)).toBe(1)
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
  ])('%s+click without movement does not toggle (and records nothing)', async (_n, mods) => {
    const { wrapper, store } = await mountEditor(base)
    await clickToggle(wrapper, 20, mods)
    expect(el(store.content, 20)).toMatchObject({ on: true })
    expect(store.canUndo).toBe(false)
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
  })

  it('a read-only panel never toggles', async () => {
    const { wrapper, store } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    await clickToggle(wrapper, 20)
    await clickToggle(wrapper, 23)
    expect(el(store.content, 20)).toMatchObject({ on: true })
    expect(el(store.content, 23)).toMatchObject({ state: 'A' })
    expect(store.canUndo).toBe(false)
  })

  it('a click on the body outside the toggle zone selects but does not toggle', async () => {
    const { wrapper, store } = await mountEditor(base)
    const at = centreOf(20)
    await body(wrapper, 20).trigger('pointerdown', pointer(wrapper, at))
    await wrapper.get('svg.canvas').trigger('pointerup', pointer(wrapper, at))
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
    expect(el(store.content, 20)).toMatchObject({ on: true })
    expect(store.canUndo).toBe(false)
  })

  it('while a wire is being drawn a click on a toggle zone adds a bend and toggles nothing', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    const at = centreOf(20)
    await toggle(wrapper, 20).trigger('pointerdown', pointer(wrapper, at))
    await wrapper.get('svg.canvas').trigger('pointerup', pointer(wrapper, at))
    expect(ctx.drawing.value?.bends).toHaveLength(1)
    expect(el(store.content, 20)).toMatchObject({ on: true })
    expect(store.canUndo).toBe(false)
  })

  it('a pointercancel during the press toggles nothing', async () => {
    const { wrapper, store } = await mountEditor(base)
    await toggle(wrapper, 20).trigger('pointerdown', pointer(wrapper, centreOf(20)))
    await wrapper.get('svg.canvas').trigger('pointercancel', pointer(wrapper, centreOf(20)))
    expect(store.canUndo).toBe(false)
    expect(el(store.content, 20)).toMatchObject({ on: true })
  })

  it('toggling a device recomputes the short circuit highlight', async () => {
    const wired = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [newDevice('breaker', id(20), 0)])],
    })
    const m = await mountEditor(wired)
    m.store.apply(addAuto(30, cw(id(2)), pole(id(20), 0, 'input')), 'editor.history.addWire')
    m.store.apply(addAuto(31, pole(id(20), 0, 'output'), cw(id(3))), 'editor.history.removeWire')
    await nextTick()
    expect(m.wrapper.findAll('path[stroke="#ff00ff"]').length).toBeGreaterThan(0)
    const l = computeLayout(m.store.content!)
    const b = l.elements.get(id(20))!
    const at = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    await toggle(m.wrapper, 20).trigger('pointerdown', pointer(m.wrapper, at))
    await m.wrapper.get('svg.canvas').trigger('pointerup', pointer(m.wrapper, at))
    await nextTick()
    expect(m.wrapper.findAll('path[stroke="#ff00ff"]')).toHaveLength(0)
  })
})

describe('toolbar defaults per button', () => {
  const click = (w: Wrapper, name: string) =>
    w
      .findAll('button')
      .find((b) => b.text() === name)!
      .trigger('click')
  const added = (c: PanelContent | null, known: number[]) =>
    c!.rails[0]!.elements.find((e) => !known.map(id).includes(e.id))!

  it.each([
    ['Додати автомат', 'breaker', 1, [false], 'Додати автомат'],
    ['Додати ПЗВ', 'rcd', 2, [false, false], 'Додати ПЗВ'],
    ['Додати реле напруги', 'voltageRelay', 2, [false, true], 'Додати реле напруги'],
  ] as [string, DeviceStyle, number, boolean[], string][])(
    '%s adds a %s of %i modules with transit flags %j, switched on and selected',
    async (button, style, width, transit, label) => {
      const { wrapper, store } = await mountEditor(content({ rails: [rail(10, 24, 150)] }), {
        toolbar: true,
      })
      await click(wrapper, button)
      const e = store.content!.rails[0]!.elements[0]!
      expect(e).toMatchObject({
        kind: 'device',
        style,
        widthModules: width,
        on: true,
        label: '',
        marking: '',
        sidesSwapped: false,
        offsetModules: 0,
        poles: transit.map((t) => ({ transit: t })),
      })
      expect(store.selection).toEqual({ kind: 'element', id: e.id })
      expect(store.undoLabel && t(store.undoLabel)).toBe(label)
    },
  )

  it('"Додати АВР" adds an ATS with style null', async () => {
    const { wrapper, store } = await mountEditor(content({ rails: [rail(10, 24, 150)] }), {
      toolbar: true,
    })
    await click(wrapper, 'Додати АВР')
    expect(store.content!.rails[0]!.elements[0]).toMatchObject({
      kind: 'ats',
      style: null,
      state: 'A',
      widthModules: 2,
    })
  })

  it('a new breaker takes the first free module (the gap at 1)', async () => {
    const { wrapper, store } = await mountEditor(base, { toolbar: true })
    await click(wrapper, 'Додати автомат')
    expect(added(store.content, [20, 21, 22, 23]).offsetModules).toBe(1)
  })

  it('a 2-module style is disabled when only one module is free, a breaker is not', async () => {
    const tight = content({
      rails: [rail(10, 3, 150, [newDevice('rcd', id(21), 0)])],
    })
    const { wrapper } = await mountEditor(tight, { toolbar: true })
    const btn = (n: string) => wrapper.findAll('button').find((b) => b.text() === n)!
    expect(btn('Додати автомат').attributes('disabled')).toBeUndefined()
    expect(btn('Додати ПЗВ').attributes('disabled')).toBeDefined()
    expect(btn('Додати ПЗВ').attributes('title')).toBe('На рейці немає вільного місця')
    expect(btn('Додати реле напруги').attributes('disabled')).toBeDefined()
    expect(btn('Додати АВР').attributes('disabled')).toBeDefined()
  })

  it('all four buttons are disabled without a rail', async () => {
    const { wrapper } = await mountEditor(content(), { toolbar: true })
    for (const n of ['Додати автомат', 'Додати ПЗВ', 'Додати реле напруги', 'Додати АВР']) {
      expect(
        wrapper
          .findAll('button')
          .find((b) => b.text() === n)!
          .attributes('disabled'),
      ).toBeDefined()
    }
  })

  it('a block on the same rail does not break the offset search', async () => {
    const c = content({ rails: [rail(10, 24, 150, [], [block(40, 0, 1, 2)])] })
    const { wrapper, store } = await mountEditor(c, { toolbar: true })
    await click(wrapper, 'Додати ПЗВ')
    expect(store.content!.rails[0]!.elements[0]!.offsetModules).toBe(1)
  })
})

describe('style select in the properties panel', () => {
  async function open(n: number, opts: Parameters<typeof mountEditor>[1] = {}) {
    const m = await mountEditor(base, { properties: true, ...opts })
    m.store.select({ kind: 'element', id: id(n) })
    await nextTick()
    return m
  }
  const select = (w: Wrapper) => selectIn(w.get('section[aria-label="Властивості апарата"]'))

  it('lists the three styles with their titles and shows the current one', async () => {
    const { wrapper } = await open(21)
    const s = select(wrapper)
    expect((s.props('items') as { title: string }[]).map((i) => i.title)).toEqual([
      'Автомат',
      'ПЗВ',
      'Реле напруги',
    ])
    expect(selectValue(s)).toBe('rcd')
  })

  it.each([
    ['breaker', 'Автомат'],
    ['voltageRelay', 'Реле напруги'],
  ])('changing an RCD to %s keeps width, poles and state in one entry', async (style) => {
    const { wrapper, store } = await open(21)
    await choose(select(wrapper), style)
    expect(el(store.content, 21)).toMatchObject({
      style,
      widthModules: 2,
      on: true,
      poles: [{ transit: false }, { transit: false }],
    })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Змінити стиль апарата')
    expect(body(wrapper, 21).attributes('data-element-style')).toBe(style)
    expect(historyLength(store)).toBe(1)
  })

  it('is disabled on a read-only panel', async () => {
    const { wrapper } = await open(21, { panel: { deletedAt: '2026-02-01T00:00:00+00:00' } })
    expect(selectDisabled(select(wrapper))).toBe(true)
  })

  it('an ATS has no style select', async () => {
    const { wrapper } = await open(23)
    expect(wrapper.find('section[aria-label="Властивості АВР"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Стиль')
  })
})
