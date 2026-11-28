/** Stage 5 editor: panel/busbar/cable properties, busbar toolbar actions, translucent mode, cable label. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { computeLayout } from '@/domain/geometry'
import type { PanelContent } from '@/domain/panelContent'
import {
  addAuto,
  ats,
  busbar,
  content,
  cw,
  element,
  feed,
  id,
  inputCable,
  outputCable,
  pole,
  rail,
  rowBlock,
  run,
} from '@/domain/__tests__/helpers'
import { mountEditor, pointer, stubLayout } from './harness'
import { t } from '@/i18n'

const dev = (n: number, offset: number, poles = 2) => element(n, offset, 1, poles)

/** R1: d20 d21 d22 d23 at 0..3, LN busbar id60 over d20..d22; wires cw2 -> feed L, cw3 -> feed N. */
function world(): PanelContent {
  let c = content({
    railWidthModules: 24,
    inputCables: [inputCable(1, [2, 3])],
    outputCables: [outputCable(4, [5])],
    terminalRow: [rowBlock(50, 3, 2)],
    rails: [
      rail(
        10,
        24,
        150,
        [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 3)],
        [],
        [busbar(60, 'LN', id(20), 3)],
      ),
    ],
  })
  c = run(c, addAuto(30, cw(id(2)), feed(id(60), 0))).content
  c = run(c, addAuto(31, cw(id(3)), feed(id(60), 1))).content
  return c
}
const noBus = (): PanelContent => ({
  ...world(),
  wires: [],
  rails: [{ ...world().rails[0]!, busbars: [] }],
})

type Wrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']
beforeEach(() => {
  stubLayout()
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const section = (w: Wrapper, name: string) => w.get(`section[aria-label="${name}"]`)
const fieldInput = (w: Wrapper, name: string, label: string) =>
  section(w, name)
    .findAll('.field')
    .find((f) => f.find('label').exists() && f.get('label').text() === label)!
    .get('input')
const button = (w: Wrapper, text: string) => w.findAll('button').find((b) => b.text() === text)!
const elSel = (n: number) => `[data-testid=element][data-id="${id(n)}"]`

describe('panel properties: rail width', () => {
  it('is shown when nothing is selected, with the current value and the 1..60 bounds', async () => {
    const { wrapper } = await mountEditor(world(), { properties: true })
    const input = fieldInput(wrapper, 'Властивості щита', 'Ширина рейок (усіх), модулів')
    expect((input.element as HTMLInputElement).value).toBe('24')
    expect(input.attributes('min')).toBe('1')
    expect(input.attributes('max')).toBe('60')
  })

  it('a committed width is one undoable entry that redraws the rails', async () => {
    const { wrapper, store } = await mountEditor(world(), { properties: true })
    const input = fieldInput(wrapper, 'Властивості щита', 'Ширина рейок (усіх), модулів')
    await input.setValue('30')
    await input.trigger('blur')
    expect(store.content?.railWidthModules).toBe(30)
    expect(store.undoLabel && t(store.undoLabel)).toBe('Змінити ширину рейок')
    expect(store.layout?.rails[0]?.w).toBe(30 * 175)
    store.undo()
    expect(store.content?.railWidthModules).toBe(24)
  })

  it('a width below what the rail items need is rejected and changes nothing', async () => {
    const { wrapper, store, ctx } = await mountEditor(world(), { properties: true })
    const input = fieldInput(wrapper, 'Властивості щита', 'Ширина рейок (усіх), модулів')
    await input.setValue('3') // d23 ends at module 4
    await input.trigger('blur')
    expect(store.content?.railWidthModules).toBe(24)
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it.each([
    ['top', 'terminalRow'],
    ['bottom', 'bottomTerminalRow'],
  ] as const)('a width below the %s terminal row end is rejected', async (_row, key) => {
    const c = { ...world(), terminalRow: [], bottomTerminalRow: [], [key]: [rowBlock(50, 6, 2)] }
    const { wrapper, store, ctx } = await mountEditor(c, { properties: true })
    const input = fieldInput(wrapper, 'Властивості щита', 'Ширина рейок (усіх), модулів')
    await input.setValue('6') // the row block ends at module 7; the rail items need only 4
    await input.trigger('blur')
    expect(store.content?.railWidthModules).toBe(24)
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
    await input.setValue('7')
    await input.trigger('blur')
    expect(store.content?.railWidthModules).toBe(7)
  })

  it('is disabled on a read-only panel', async () => {
    const { wrapper } = await mountEditor(world(), {
      properties: true,
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    expect(
      fieldInput(wrapper, 'Властивості щита', 'Ширина рейок (усіх), модулів').attributes(
        'disabled',
      ),
    ).toBeDefined()
  })
})

describe('busbar properties', () => {
  const S = 'Властивості шини'
  const open = async (c = world()) => {
    const m = await mountEditor(c, { properties: true, toolbar: true })
    m.store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    return m
  }

  it('shows the type and the count', async () => {
    const { wrapper } = await open()
    expect((section(wrapper, S).get('select').element as HTMLSelectElement).value).toBe('LN')
    expect((fieldInput(wrapper, S, 'Кількість апаратів').element as HTMLInputElement).value).toBe(
      '3',
    )
    expect(section(wrapper, S).text()).toContain('Перехід на L видалить проводи')
  })

  it('LN to L deletes the wires on feed N as one entry; undo restores them', async () => {
    const { wrapper, store } = await open()
    await section(wrapper, S).get('select').setValue('L')
    expect(store.content?.rails[0]?.busbars[0]?.type).toBe('L')
    expect(store.content?.wires.map((w) => w.id)).toEqual([id(30)])
    expect(store.undoLabel && t(store.undoLabel)).toBe('Змінити тип шини')
    store.undo()
    expect(store.content?.rails[0]?.busbars[0]?.type).toBe('LN')
    expect(store.content?.wires.map((w) => w.id)).toEqual([id(30), id(31)])
    expect(store.canUndo).toBe(false)
  })

  it('the count commits on blur within 2..free devices', async () => {
    const { wrapper, store } = await open()
    const input = fieldInput(wrapper, S, 'Кількість апаратів')
    expect(input.attributes('min')).toBe('2')
    expect(input.attributes('max')).toBe('4')
    await input.setValue('4')
    await input.trigger('blur')
    expect(store.content?.rails[0]?.busbars[0]?.count).toBe(4)
    expect(store.undoLabel && t(store.undoLabel)).toBe('Змінити довжину шини')
  })

  it('a count beyond the free devices or below 2 is rejected', async () => {
    const { wrapper, store } = await open()
    const input = fieldInput(wrapper, S, 'Кількість апаратів')
    for (const v of ['5', '1']) {
      await input.setValue(v)
      await input.trigger('blur')
      expect(store.content?.rails[0]?.busbars[0]?.count).toBe(3)
    }
    expect(store.canUndo).toBe(false)
  })

  it('shows the validity problems of an invalid busbar', async () => {
    const c = world()
    const broken: PanelContent = {
      ...c,
      rails: [{ ...c.rails[0]!, busbars: [{ ...c.rails[0]!.busbars[0]!, count: 6 }] }],
    }
    const { wrapper, store } = await open(broken)
    expect(section(wrapper, S).find('[role=alert]').exists()).toBe(true)
    expect(store.invalidBusbars.has(id(60))).toBe(true)
  })

  it('a valid busbar shows no problem list', async () => {
    const { wrapper, store } = await open()
    expect(section(wrapper, S).find('[role=alert]').exists()).toBe(false)
    expect(store.invalidBusbars.size).toBe(0)
  })

  it('"Видалити шину" removes the busbar with its feed wires, one entry', async () => {
    const { wrapper, store } = await open()
    await button(section(wrapper, S) as never, 'Видалити шину').trigger('click')
    expect(store.content?.rails[0]?.busbars).toEqual([])
    expect(store.content?.wires).toEqual([])
    store.undo()
    expect(store.content?.wires).toHaveLength(2)
  })

  it('is read-only on a trashed panel', async () => {
    const m = await mountEditor(world(), {
      properties: true,
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    m.store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    expect(section(m.wrapper, S).get('select').attributes('disabled')).toBeDefined()
  })
})

describe('toolbar: add busbar', () => {
  it('both buttons are disabled with a hint until a device is selected', async () => {
    const { wrapper } = await mountEditor(noBus(), { toolbar: true })
    for (const t of ['Додати шину L', 'Додати шину L+N']) {
      expect(button(wrapper, t).attributes('disabled')).toBeDefined()
    }
    expect(button(wrapper, 'Додати шину L').attributes('title')).toContain('Виберіть апарат')
  })

  it('with a selected device the busbar covers the free adjacent devices; one undoable entry', async () => {
    const { wrapper, store } = await mountEditor(noBus(), { toolbar: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    await button(wrapper, 'Додати шину L+N').trigger('click')
    const bar = store.content!.rails[0]!.busbars[0]!
    expect(bar).toMatchObject({ type: 'LN', firstElementId: id(20), count: 4 })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Додати шину L+N')
    expect(wrapper.find('[data-testid=busbar]').exists()).toBe(true)
    store.undo()
    expect(store.content?.rails[0]?.busbars).toEqual([])
  })

  it('the L button adds an L busbar', async () => {
    const { wrapper, store } = await mountEditor(noBus(), { toolbar: true })
    store.select({ kind: 'element', id: id(21) })
    await nextTick()
    await button(wrapper, 'Додати шину L').trigger('click')
    expect(store.content?.rails[0]?.busbars[0]).toMatchObject({ type: 'L', count: 3 })
  })

  it('a device with no free neighbour on the right keeps the button disabled with the reason', async () => {
    const { wrapper, store } = await mountEditor(noBus(), { toolbar: true })
    store.select({ kind: 'element', id: id(23) })
    await nextTick()
    const b = button(wrapper, 'Додати шину L')
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toContain('немає вільного суміжного апарата')
  })

  it('an already covered device cannot be an anchor', async () => {
    const { wrapper, store } = await mountEditor(world(), { toolbar: true })
    store.select({ kind: 'element', id: id(21) })
    await nextTick()
    expect(button(wrapper, 'Додати шину L').attributes('disabled')).toBeDefined()
  })
})

describe('translucent mode', () => {
  const toggleBtn = (w: Wrapper) => button(w, 'Прозорий режим')

  it('the toolbar toggle flips aria-pressed and the bodies class; the choice is remembered', async () => {
    const { wrapper } = await mountEditor(world(), { toolbar: true })
    expect(toggleBtn(wrapper).attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid=bodies]').classes()).not.toContain('translucent')
    await toggleBtn(wrapper).trigger('click')
    expect(toggleBtn(wrapper).attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid=bodies]').classes()).toContain('translucent')
    expect(localStorage.getItem('electrical.editor.translucent')).toBe('1')
    await toggleBtn(wrapper).trigger('click')
    expect(localStorage.getItem('electrical.editor.translucent')).toBe('0')
  })

  it('the toggle works with the mode on (it is not disabled by itself)', async () => {
    const { wrapper } = await mountEditor(world(), { toolbar: true })
    await toggleBtn(wrapper).trigger('click')
    expect(toggleBtn(wrapper).attributes('disabled')).toBeUndefined()
    await toggleBtn(wrapper).trigger('click')
    expect(toggleBtn(wrapper).attributes('aria-pressed')).toBe('false')
  })

  it('starts on when the remembered choice is on', async () => {
    localStorage.setItem('electrical.editor.translucent', '1')
    const { wrapper } = await mountEditor(world(), { toolbar: true })
    expect(toggleBtn(wrapper).attributes('aria-pressed')).toBe('true')
  })

  async function dragDevice(wrapper: Wrapper, n: number, dx: number, dy = 0, extra = {}) {
    const b = computeLayout(world()).elements.get(id(n))!
    const from = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    await wrapper.get(elSel(n)).trigger('pointerdown', pointer(wrapper, from, extra))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: from.x + dx, y: from.y + dy }, extra))
    await wrapper
      .get('svg')
      .trigger('pointerup', pointer(wrapper, { x: from.x + dx, y: from.y + dy }, extra))
  }

  it('control: without the mode a drag moves the device', async () => {
    const { wrapper, store } = await mountEditor(noBus())
    await dragDevice(wrapper, 23, 5 * 175)
    expect(store.content?.rails[0]?.elements.find((e) => e.id === id(23))?.offsetModules).toBe(8)
  })

  it('a drag moves nothing and records nothing in translucent mode', async () => {
    const { wrapper, store, ctx } = await mountEditor(noBus())
    ctx.translucent.value = true
    await dragDevice(wrapper, 23, 5 * 175)
    expect(store.content?.rails[0]?.elements.find((e) => e.id === id(23))?.offsetModules).toBe(3)
    expect(store.canUndo).toBe(false)
    expect(wrapper.find('[data-testid=invalid-ghost]').exists()).toBe(false)
  })

  it('Ctrl-drag creates no copy in translucent mode', async () => {
    const { wrapper, store, ctx } = await mountEditor(noBus())
    ctx.translucent.value = true
    await dragDevice(wrapper, 23, 5 * 175, 0, { ctrlKey: true })
    expect(store.content?.rails[0]?.elements).toHaveLength(4)
    expect(store.canUndo).toBe(false)
  })

  it('a click still selects the device', async () => {
    const { wrapper, store, ctx } = await mountEditor(noBus())
    ctx.translucent.value = true
    const b = computeLayout(noBus()).elements.get(id(23))!
    const at = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    await wrapper.get(elSel(23)).trigger('pointerdown', pointer(wrapper, at))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, at))
    expect(store.selection).toEqual({ kind: 'element', id: id(23) })
  })

  it('the on/off toggle zone still works', async () => {
    const { wrapper, store, ctx } = await mountEditor(noBus())
    ctx.translucent.value = true
    await wrapper
      .get(`[data-testid=toggle][data-id="${id(23)}"]`)
      .trigger('keydown', { key: 'Enter' })
    expect((store.content?.rails[0]?.elements[3] as { on: boolean }).on).toBe(false)
  })

  it('the busbar edge handle is shown for a selected busbar and hidden in translucent mode', async () => {
    const { wrapper, store, ctx } = await mountEditor(world())
    store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    expect(wrapper.find('[data-testid=busbar-edge]').exists()).toBe(true)
    ctx.translucent.value = true
    await nextTick()
    expect(wrapper.find('[data-testid=busbar-edge]').exists()).toBe(false)
  })

  it('wires can still be drawn in translucent mode', async () => {
    const { wrapper, store, ctx } = await mountEditor(noBus())
    ctx.translucent.value = true
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    await wrapper
      .get(`[data-ep-kind=pole][data-ep-a="${id(20)}"][data-ep-b="0"][data-ep-side=input]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.content?.wires).toHaveLength(1)
    expect(store.undoLabel && t(store.undoLabel)).toBe('Додати провід')
  })
})

describe('busbar on the canvas', () => {
  it('draws the body and one feed per type; a feed starts a wire', async () => {
    const { wrapper, store } = await mountEditor(noBus())
    expect(wrapper.find('[data-testid=busbar]').exists()).toBe(false)
    const withBar = world()
    const m = await mountEditor({ ...withBar, wires: [] })
    expect(m.wrapper.findAll('[data-ep-kind=busbar]')).toHaveLength(2)
    await m.wrapper
      .get(`[data-ep-kind=busbar][data-ep-a="${id(60)}"][data-ep-b="0"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    await m.wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(m.store.content?.wires).toHaveLength(1)
    // the feed L wire is brown by default (the start contact decides)
    expect(m.store.content?.wires[0]?.colour).toBe('brown')
    expect(store.content?.rails[0]?.busbars).toEqual([])
  })

  it('an invalid busbar is highlighted live', async () => {
    const c = world()
    const broken: PanelContent = {
      ...c,
      rails: [{ ...c.rails[0]!, busbars: [{ ...c.rails[0]!.busbars[0]!, count: 9 }] }],
    }
    const { wrapper } = await mountEditor(broken)
    expect(wrapper.get('[data-testid=busbar]').classes()).toContain('violation')
  })

  it('deleting a covered device through the selection shrinks the busbar (one entry)', async () => {
    const { store, ctx } = await mountEditor(world(), { toolbar: true })
    store.select({ kind: 'element', id: id(22) })
    ctx.deleteSelected()
    expect(store.content?.rails[0]?.busbars[0]?.count).toBe(2)
    store.undo()
    expect(store.content?.rails[0]?.busbars[0]?.count).toBe(3)
    expect(store.canUndo).toBe(false)
  })
})

describe('cable label', () => {
  const labelled = (): PanelContent => {
    const c = world()
    return {
      ...c,
      inputCables: [{ ...c.inputCables[0]!, label: 'Ввід А' }],
      outputCables: [{ ...c.outputCables[0]!, label: 'Світло' }],
    }
  }

  it('is drawn inside the box: input baseline boxY + 130, output boxY + 140', async () => {
    const { wrapper } = await mountEditor(labelled())
    const marks = wrapper.findAll('[data-testid=cable-mark]')
    expect(marks.map((m) => m.text())).toEqual(['Ввід А', 'Світло'])
    const l = computeLayout(labelled())
    expect(marks[0]!.attributes('y')).toBe(String(200 + 130))
    expect(marks[1]!.attributes('y')).toBe(String(l.outTop + 140))
    expect(marks[0]!.attributes('x')).toBe(String(l.inputBoxes[0]!.x + l.inputBoxes[0]!.w / 2))
  })

  it('an empty label draws nothing', async () => {
    const { wrapper } = await mountEditor(world())
    expect(wrapper.find('[data-testid=cable-mark]').exists()).toBe(false)
  })

  it('the cable property field commits the label (<= 16) and rejects 17 characters', async () => {
    const { wrapper, store } = await mountEditor(world(), { properties: true })
    store.select({ kind: 'inputCable', id: id(1) })
    await nextTick()
    const input = wrapper
      .findAll('.field')
      .find((f) => f.find('label').exists() && f.get('label').text().startsWith('Позначення'))!
      .get('input')
    await input.setValue('x'.repeat(17))
    await input.trigger('blur')
    expect(store.content?.inputCables[0]?.label).toBe('')
    await input.setValue('Ввід 1')
    await input.trigger('blur')
    expect(store.content?.inputCables[0]?.label).toBe('Ввід 1')
    expect(store.canUndo).toBe(true)
  })
})

describe('busbar edge drag', () => {
  const edgeX = (n: number) => {
    const b = computeLayout(world()).elements.get(id(n))!
    return b.x + b.w
  }
  const edge = (w: Wrapper) => w.get('[data-testid=busbar-edge]')

  async function open(c = world()) {
    const m = await mountEditor(c)
    m.store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    return m
  }
  async function drag(m: Awaited<ReturnType<typeof open>>, xs: number[]) {
    const y = 600
    await edge(m.wrapper).trigger('pointerdown', pointer(m.wrapper, { x: edgeX(22), y }))
    for (const x of xs) {
      await m.wrapper.get('svg').trigger('pointermove', pointer(m.wrapper, { x, y }))
    }
    await m.wrapper
      .get('svg')
      .trigger('pointerup', pointer(m.wrapper, { x: xs[xs.length - 1] ?? 0, y }))
  }
  const count = (m: Awaited<ReturnType<typeof open>>) =>
    m.store.content?.rails[0]?.busbars[0]?.count

  it('changes the count to the nearest edge as one undoable entry; undo restores it', async () => {
    const m = await open()
    await drag(m, [edgeX(22) + 20, edgeX(23) - 30])
    expect(count(m)).toBe(4)
    expect(m.store.undoLabel && t(m.store.undoLabel)).toBe('Змінити довжину шини')
    m.store.undo()
    expect(count(m)).toBe(3)
    expect(m.store.canUndo).toBe(false)
  })

  it('shrinks to the nearest shorter edge too', async () => {
    const m = await open()
    await drag(m, [edgeX(21) + 10])
    expect(count(m)).toBe(2)
    expect(m.store.undoLabel && t(m.store.undoLabel)).toBe('Змінити довжину шини')
  })

  it('dragging past the free devices clamps to the last free device', async () => {
    const m = await open()
    await drag(m, [edgeX(23) + 4000])
    expect(count(m)).toBe(4)
  })

  it('dragging before the second device clamps to the minimum of 2', async () => {
    const m = await open()
    await drag(m, [0])
    expect(count(m)).toBe(2)
  })

  it('dragging back to the original count records nothing', async () => {
    const m = await open()
    await drag(m, [edgeX(23), edgeX(22)])
    expect(count(m)).toBe(3)
    expect(m.store.canUndo).toBe(false)
  })

  it('records nothing when the busbar has no valid range (max below 2)', async () => {
    // an ATS right after the anchor: no adjacent free device, the stored count is invalid
    const c = content({
      railWidthModules: 24,
      inputCables: [inputCable(1, [2, 3])],
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), ats(21, 1, 2), dev(22, 3)],
          [],
          [busbar(60, 'L', id(20), 2)],
        ),
      ],
    })
    const m = await open(c)
    const box = computeLayout(c).elements.get(id(21))!
    await drag(m, [box.x + box.w + 100])
    expect(m.store.content?.rails[0]?.busbars[0]?.count).toBe(2)
    expect(m.store.canUndo).toBe(false)
  })

  it('is disabled in translucent mode: no handle, nothing recorded', async () => {
    const m = await open()
    m.ctx.translucent.value = true
    await nextTick()
    expect(m.wrapper.find('[data-testid=busbar-edge]').exists()).toBe(false)
    expect(count(m)).toBe(3)
    expect(m.store.canUndo).toBe(false)
  })
})

describe('layer order (G.1)', () => {
  /** True when `a` comes before `b` in the document. */
  const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  async function layers(translucent: boolean) {
    const m = await mountEditor(world())
    m.store.select({ kind: 'busbar', id: id(60) })
    m.ctx.translucent.value = translucent
    await nextTick()
    const q = (sel: string) => m.wrapper.get(sel).element
    return {
      rail: q('[data-testid=rail]'),
      wire: q('[data-testid=wire]'),
      bodies: q('[data-testid=bodies]'),
      busbarBody: q('[data-testid=busbar]'),
      hits: m.wrapper.find('.wire-hits').exists() ? q('.wire-hits') : null,
      contact: q('[data-ep-kind=pole]'),
      feed: q('[data-ep-kind=busbar]'),
      handle: m.wrapper.find('[data-testid=busbar-edge]').exists()
        ? q('[data-testid=busbar-edge]')
        : null,
    }
  }

  it('normal mode: rails, wires, bodies (with the busbar body), then contacts, feeds and the edge handle', async () => {
    const l = await layers(false)
    expect(l.hits).toBeNull()
    expect(before(l.rail, l.wire)).toBe(true)
    expect(before(l.wire, l.bodies)).toBe(true)
    expect(l.bodies.contains(l.busbarBody)).toBe(true)
    for (const above of [l.contact, l.feed, l.handle!]) {
      expect(before(l.bodies, above)).toBe(true)
    }
  })

  it('translucent mode: the wire-hit group sits between the bodies and the contacts', async () => {
    const l = await layers(true)
    expect(l.hits).not.toBeNull()
    expect(before(l.rail, l.bodies)).toBe(true)
    expect(before(l.bodies, l.hits!)).toBe(true)
    for (const above of [l.contact, l.feed]) {
      expect(before(l.hits!, above)).toBe(true)
    }
  })
})

describe('translucent wire-hit layer', () => {
  const wiredWorld = (): PanelContent =>
    run(noBus(), addAuto(40, cw(id(2)), pole(id(20), 0, 'input'))).content

  it('clicking the hit path selects the wire and there is exactly one data-testid=wire per wire', async () => {
    const { wrapper, store, ctx } = await mountEditor(wiredWorld())
    expect(wrapper.findAll('[data-testid=wire]')).toHaveLength(1)
    ctx.translucent.value = true
    await nextTick()
    const hits = wrapper.findAll('[data-testid=wire]')
    expect(hits).toHaveLength(1) // no duplicate from WirePath
    expect(wrapper.find('.wire-hits [data-testid=wire]').exists()).toBe(true)
    await hits[0]!.trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.selection).toEqual({ kind: 'wire', id: id(40) })
  })

  it('a double-click on a segment inserts a bend (one entry); undo removes it', async () => {
    const { wrapper, store, ctx } = await mountEditor(wiredWorld())
    ctx.translucent.value = true
    await nextTick()
    const before = store.content!.wires[0]!.bends.length
    const bend = store.content!.wires[0]!.bends[0]!
    await wrapper
      .get('[data-testid=wire]')
      .trigger('dblclick', pointer(wrapper, { x: bend.x - 6, y: bend.y }))
    expect(store.content!.wires[0]!.bends.length).toBe(before + 1)
    expect(store.undoLabel && t(store.undoLabel)).toBe('Додати злам')
    store.undo()
    expect(store.content!.wires[0]!.bends.length).toBe(before)
    expect(store.canUndo).toBe(false)
  })

  it('a bend can be dragged in translucent mode (one entry)', async () => {
    const { wrapper, store, ctx } = await mountEditor(wiredWorld())
    ctx.translucent.value = true
    await nextTick()
    await wrapper.get('[data-testid=wire]').trigger('pointerdown', { button: 0, pointerId: 1 })
    const from = store.content!.wires[0]!.bends[0]!
    await wrapper
      .get('[data-testid=bend][data-index="0"]')
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: from.x, y: from.y - 60 }))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x, y: from.y - 60 }))
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перемістити злам')
    expect(store.content!.wires[0]!.bends[0]!.y).toBe(from.y - 60)
    store.undo()
    expect(store.canUndo).toBe(false)
  })

  it('Ctrl pressed during a translucent drag shows no ghost; the same key shows a copy ghost otherwise', async () => {
    const press = () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
    for (const translucent of [false, true]) {
      const { wrapper, ctx } = await mountEditor(noBus())
      ctx.translucent.value = translucent
      const b = computeLayout(noBus()).elements.get(id(23))!
      const from = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      await wrapper.get(elSel(23)).trigger('pointerdown', pointer(wrapper, from))
      await wrapper
        .get('svg')
        .trigger('pointermove', pointer(wrapper, { x: from.x + 5 * 175, y: from.y }))
      press()
      await nextTick()
      const ghosts = wrapper.findAll('[data-testid=copy-ghost],[data-testid=invalid-ghost]')
      expect(ghosts.length > 0).toBe(!translucent)
      await wrapper.get('svg').trigger('pointercancel')
      wrapper.unmount()
    }
  })
})

describe('busbar type select after a rejected change', () => {
  it('shows the stored type again', async () => {
    const m = await mountEditor(world(), { properties: true })
    m.store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    const select = m.wrapper.get('section[aria-label="Властивості шини"] select')
    const el = select.element as HTMLSelectElement
    el.value = 'XX' // not an option: the DOM yields '' and the command rejects it
    await select.trigger('change')
    expect(m.store.content?.rails[0]?.busbars[0]?.type).toBe('LN')
    expect(m.store.canUndo).toBe(false)
    expect(m.ctx.notice.value?.tone).toBe('error')
    expect(el.value).toBe('LN')
  })

  it('an accepted change keeps the new value', async () => {
    const m = await mountEditor(world(), { properties: true })
    m.store.select({ kind: 'busbar', id: id(60) })
    await nextTick()
    const select = m.wrapper.get('section[aria-label="Властивості шини"] select')
    await select.setValue('L')
    expect((select.element as HTMLSelectElement).value).toBe('L')
    expect(m.store.content?.rails[0]?.busbars[0]?.type).toBe('L')
  })
})
