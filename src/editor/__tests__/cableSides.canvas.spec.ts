/** Cable sides and the two terminal rows in the editor: rendering, drag between rows, copy, side selects. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { computeLayout } from '@/domain/geometry'
import type { PanelContent } from '@/domain/panelContent'
import {
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  pole,
  rail,
  rowBlock,
  term,
  addAuto,
} from '@/domain/__tests__/helpers'
import CableRow from '../CableRow.vue'
import { mountEditor, pointer, stubLayout } from './harness'
import { t } from '@/i18n'

type Wrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']
const CTRL = { ctrlKey: true }

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Top row: id50 [0,2) 3 contacts, id51 [6,7); bottom row: id52 [3,4); one rail with E1 id20 [0,2). */
const base: PanelContent = content({
  railWidthModules: 24,
  inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
  outputCables: [outputCable(4, [5, 6])],
  terminalRow: [rowBlock(50, 0, 3), rowBlock(51, 6, 2)],
  bottomTerminalRow: [rowBlock(52, 3, 2)],
  rails: [rail(10, 24, 150, [element(20, 0, 2, 2)], [block(40, 10, 1, 2)])],
})
const layout = computeLayout(base)
const blockSel = (n: number) => `[data-testid=block][data-id="${id(n)}"]`
const centreOf = (n: number, l = layout) => {
  const b = l.blocks.get(id(n))!
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}
const rowMid = (y: number) => y + 125

async function drag(
  wrapper: Wrapper,
  selector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  mods: { up?: object } = {},
) {
  await wrapper.get(selector).trigger('pointerdown', pointer(wrapper, from))
  await wrapper.get('svg').trigger('pointermove', pointer(wrapper, to))
  await wrapper.get('svg').trigger('pointerup', pointer(wrapper, to, mods.up ?? {}))
}
function historyLength(store: { undo: () => string | null }): number {
  let n = 0
  while (store.undo() !== null) n++
  return n
}

describe('CableRow: boxes by side', () => {
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
  const labelled = (side: 'top' | 'bottom' | 'left' | 'right', label = 'Мережа') =>
    content({
      inputCableSide: side,
      outputCableSide: side === 'left' ? 'right' : 'left',
      inputCables: [{ ...inputCable(1, [2, 3]), label }],
      outputCables: [{ ...outputCable(4, [5]), label: 'Розетки' }],
    })

  it.each(['top', 'bottom', 'left', 'right'] as const)(
    'marks the boxes with data-side=%s',
    (side) => {
      const w = render(labelled(side))
      expect(w.get('[data-testid=input-cable]').attributes('data-side')).toBe(side)
      expect(w.get('[data-testid=output-cable]').attributes('data-side')).toBe(
        side === 'left' ? 'right' : 'left',
      )
    },
  )

  it.each(['top', 'bottom'] as const)('horizontal text on a %s box is not rotated', (side) => {
    const w = render({ ...labelled(side), outputCableSide: side })
    const texts = w.findAll('text')
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every((t) => t.attributes('transform') === undefined)).toBe(true)
  })

  it.each(['left', 'right'] as const)(
    'the caption on a %s box is rotated by -90 degrees about its anchor',
    (side) => {
      const c = content({
        inputCableSide: side,
        inputCables: [inputCable(1, [2, 3])],
        railWidthModules: 24,
      })
      const l = computeLayout(c)
      const box = l.inputBoxes[0]!
      const w = render(c)
      const caption = w.findAll('text').find((t) => t.text() === 'Вх 1')!
      const anchorX = box.x + (side === 'left' ? 80 : 190)
      const anchorY = box.y + box.h / 2
      expect(caption.attributes('transform')).toBe(`rotate(-90 ${anchorX} ${anchorY})`)
      expect(caption.attributes('x')).toBe(String(anchorX))
      expect(caption.attributes('y')).toBe(String(anchorY))
    },
  )

  it('the user label of a left box is rotated and placed at the label baseline, a right box at +140', () => {
    const left = computeLayout(labelled('left'))
    const lw = render(labelled('left'))
    const mark = lw.get('[data-testid=cable-mark]')
    const box = left.inputBoxes[0]!
    expect(mark.attributes('x')).toBe(String(box.x + 130))
    expect(mark.attributes('transform')).toBe(`rotate(-90 ${box.x + 130} ${box.y + box.h / 2})`)

    const right = computeLayout(labelled('right'))
    const rw = render(labelled('right'))
    const rbox = right.inputBoxes[0]!
    expect(rw.get('[data-testid=cable-mark]').attributes('x')).toBe(String(rbox.x + 140))
  })

  it('top box baselines: caption +80, label +130; bottom box: label +140, caption +190', () => {
    const top = computeLayout(labelled('top'))
    const tw = render(labelled('top'))
    const tbox = top.inputBoxes[0]!
    expect(
      tw
        .findAll('text')
        .find((t) => t.text() === 'Вх 1')!
        .attributes('y'),
    ).toBe(String(tbox.y + 80))
    expect(tw.get('[data-testid=cable-mark]').attributes('y')).toBe(String(tbox.y + 130))

    const bottom = computeLayout(labelled('bottom'))
    const bw = render(labelled('bottom'))
    const bbox = bottom.inputBoxes[0]!
    expect(
      bw
        .findAll('text')
        .find((t) => t.text() === 'Вх 1')!
        .attributes('y'),
    ).toBe(String(bbox.y + 190))
    expect(bw.get('[data-testid=cable-mark]').attributes('y')).toBe(String(bbox.y + 140))
  })

  it('the caption of an output cable keeps its own numbering on a shared side', () => {
    const c = content({
      inputCableSide: 'top',
      outputCableSide: 'top',
      inputCables: [inputCable(1, [2]), inputCable(6, [7])],
      outputCables: [outputCable(4, [5])],
    })
    const captions = render(c)
      .findAll('text')
      .map((t) => t.text())
    expect(captions).toEqual(['Вх 1', 'Вх 2', 'Вих 1'])
  })

  it('the contacts layer draws one hit target per wire at its point', () => {
    const c = labelled('left')
    const l = computeLayout(c)
    const w = render(c, 'contacts')
    const hits = w.findAll('[data-testid=terminal]')
    expect(hits).toHaveLength(3)
    const first = l.inputBoxes[0]!.wires[0]!.pt
    expect(hits[0]?.attributes('cx')).toBe(String(first.x))
    expect(hits[0]?.attributes('cy')).toBe(String(first.y))
  })

  it('a box without a label has no mark text', () => {
    const w = render(content({ inputCableSide: 'left' }))
    expect(w.find('[data-testid=cable-mark]').exists()).toBe(false)
  })
})

describe('PanelCanvas: cables and rows by side', () => {
  it('renders both terminal row bands, always, even in an empty panel', async () => {
    const { wrapper } = await mountEditor(content())
    expect(wrapper.find('[data-testid=terminal-row]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=terminal-row-bottom]').exists()).toBe(true)
  })

  it('the bands sit at topRowY and bottomRowY at the rail width', async () => {
    const { wrapper } = await mountEditor(base)
    const top = wrapper.get('[data-testid=terminal-row] rect')
    const bottom = wrapper.get('[data-testid=terminal-row-bottom] rect')
    expect(top.attributes('y')).toBe(String(layout.topRowY))
    expect(bottom.attributes('y')).toBe(String(layout.bottomRowY))
    expect(top.attributes('width')).toBe(String(24 * 175))
    expect(top.attributes('x')).toBe(String(layout.railsLeft))
  })

  it('draws every cable box on its side and the bands follow a side change', async () => {
    const { wrapper } = await mountEditor({ ...base, inputCableSide: 'left' })
    expect(wrapper.get('[data-testid=input-cable]').attributes('data-side')).toBe('left')
    expect(wrapper.get('[data-testid=output-cable]').attributes('data-side')).toBe('bottom')
    const l = computeLayout({ ...base, inputCableSide: 'left' })
    expect(wrapper.get('[data-testid=terminal-row] rect').attributes('x')).toBe(String(l.railsLeft))
    expect(l.railsLeft).toBe(600)
  })

  it('a bottom-row block is drawn in the bottom band and has its contacts', async () => {
    const { wrapper } = await mountEditor(base)
    expect(wrapper.get(blockSel(52)).attributes('data-block-zone')).toBe('row')
    expect(
      wrapper.findAll(`[data-ep-kind=terminal][data-ep-a="${id(52)}"][data-ep-cs=top]`),
    ).toHaveLength(2)
    expect(
      wrapper.findAll(`[data-ep-kind=terminal][data-ep-a="${id(52)}"][data-ep-cs=bottom]`),
    ).toHaveLength(2)
  })
})

describe('dragging a block between the rows', () => {
  it('top -> bottom: the block lands at the drop offset, one history entry, wires stay attached', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(addAuto(30, term(id(50), 0, 'top'), cw(id(2))), 'editor.history.addWire')
    const from = centreOf(50, computeLayout(store.content!))
    const l = computeLayout(store.content!)
    const to = { x: from.x + 8 * 175, y: rowMid(l.bottomRowY) }
    await drag(wrapper, blockSel(50), from, to)
    expect(store.content?.terminalRow.map((b) => b.id)).toEqual([id(51)])
    expect(store.content?.bottomTerminalRow.map((b) => [b.id, b.offsetModules])).toEqual([
      [id(52), 3],
      [id(50), 8],
    ])
    expect(store.content?.wires[0]?.start).toEqual(term(id(50), 0, 'top'))
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перемістити клемний блок')
    expect(historyLength(store)).toBe(2) // the wire and the move
  })

  it('bottom -> top works the same way and one undo restores the row', async () => {
    const { wrapper, store } = await mountEditor(base)
    const before = store.content
    const from = centreOf(52)
    await drag(wrapper, blockSel(52), from, { x: from.x + 5 * 175, y: rowMid(layout.topRowY) })
    expect(store.content?.bottomTerminalRow).toEqual([])
    expect(store.content?.terminalRow.map((b) => [b.id, b.offsetModules])).toEqual([
      [id(50), 0],
      [id(51), 6],
      [id(52), 8],
    ])
    store.undo()
    expect(store.content).toBe(before)
  })

  it('a drop on a taken place of the other row is refused and nothing changes', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const before = store.content
    const from = centreOf(50)
    // id52 occupies bottom offset [3,4): drop id50 (2 modules, grabbed at its centre) over it
    await drag(wrapper, blockSel(50), from, { x: centreOf(52).x, y: rowMid(layout.bottomRowY) })
    expect(store.content).toBe(before)
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
    expect(ctx.notice.value?.text).toContain('Елемент повернено на місце')
  })

  it('a drag that stays in its row moves along it and does not change the other row', async () => {
    const { wrapper, store } = await mountEditor(base)
    const other = store.content!.bottomTerminalRow
    const from = centreOf(51)
    await drag(wrapper, blockSel(51), from, { x: from.x + 5 * 175, y: from.y })
    expect(store.content?.terminalRow.find((b) => b.id === id(51))?.offsetModules).toBe(11)
    expect(store.content?.bottomTerminalRow).toBe(other)
  })

  it('a block cannot be dropped between the bands (neither row)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(50)
    await wrapper.get(blockSel(50)).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: from.x, y: 900 }))
    expect(wrapper.get('.hint').text()).toBe('Перетягніть у ряд клемників')
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x, y: 900 }))
    expect(store.canUndo).toBe(false)
  })

  it('a rail device dropped into the bottom row is refused with the zone message', async () => {
    const { wrapper, store } = await mountEditor(base)
    const e = layout.elements.get(id(20))!
    const from = { x: e.x + e.w / 2, y: e.y + e.h / 2 }
    await wrapper
      .get(`[data-testid=element][data-id="${id(20)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: from.x, y: rowMid(layout.bottomRowY) }))
    expect(wrapper.get('.hint').text()).toBe('Елемент рейки не можна перенести в ряд клемників')
    await wrapper
      .get('svg')
      .trigger('pointerup', pointer(wrapper, { x: from.x, y: rowMid(layout.bottomRowY) }))
    expect(store.canUndo).toBe(false)
  })

  it('a read-only panel moves nothing between rows', async () => {
    const { wrapper, store } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    const from = centreOf(50)
    await drag(wrapper, blockSel(50), from, { x: from.x, y: rowMid(layout.bottomRowY) })
    expect(store.canUndo).toBe(false)
    expect(store.content?.terminalRow).toHaveLength(2)
  })
})

describe('Ctrl-copy of a row block into either row', () => {
  it.each([
    ['top', 50, 'bottom', 'bottomTerminalRow', 12],
    ['bottom', 52, 'top', 'terminalRow', 15],
  ] as const)(
    'a block of the %s row (id %i) copied into the %s row: new id, original stays, one entry',
    async (_from, source, into, key, offset) => {
      const { wrapper, store } = await mountEditor(base)
      const from = centreOf(source)
      const y = rowMid(into === 'top' ? layout.topRowY : layout.bottomRowY)
      const grab = from.x - layout.blocks.get(id(source))!.x
      await drag(wrapper, blockSel(source), from, { x: 200 + offset * 175 + grab, y }, { up: CTRL })
      const original = [...store.content!.terminalRow, ...store.content!.bottomTerminalRow].filter(
        (b) => b.id === id(source),
      )
      expect(original).toHaveLength(1)
      const copy = store.content![key].find(
        (b) => b.id !== id(source) && b.offsetModules === offset,
      )
      expect(copy).toBeDefined()
      expect(copy?.id).not.toBe(id(source))
      expect(store.selection).toEqual({ kind: 'block', id: copy!.id })
      expect(store.undoLabel && t(store.undoLabel)).toBe('Копіювати')
      expect(historyLength(store)).toBe(1)
    },
  )

  it('a copy dropped on a taken place creates nothing', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const before = store.content
    const from = centreOf(50)
    await drag(
      wrapper,
      blockSel(50),
      from,
      { x: centreOf(52).x, y: rowMid(layout.bottomRowY) },
      { up: CTRL },
    )
    expect(store.content).toBe(before)
    expect(ctx.notice.value?.text).toContain('Копію не створено')
  })

  it('a copy does not take over the wires of its source', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(
      addAuto(30, term(id(50), 0, 'top'), pole(id(20), 0, 'input')),
      'editor.history.addWire',
    )
    const l = computeLayout(store.content!)
    const from = centreOf(50, l)
    await drag(
      wrapper,
      blockSel(50),
      from,
      { x: from.x + 4 * 175, y: rowMid(l.bottomRowY) },
      { up: CTRL },
    )
    expect(store.content?.wires).toHaveLength(1)
    expect(store.content?.wires[0]?.start).toEqual(term(id(50), 0, 'top'))
  })
})

describe('panel properties: cable side selects', () => {
  const open = async (c: PanelContent = base, panel: object = {}) => {
    const m = await mountEditor(c, { properties: true, panel })
    await nextTick()
    return m
  }
  const select = (w: Wrapper, kind: 'input' | 'output') => w.get(`[data-testid=${kind}-cable-side]`)

  it('shows the current sides', async () => {
    const { wrapper } = await open()
    expect((select(wrapper, 'input').element as HTMLSelectElement).value).toBe('top')
    expect((select(wrapper, 'output').element as HTMLSelectElement).value).toBe('bottom')
    expect(
      select(wrapper, 'input')
        .findAll('option')
        .map((o) => o.attributes('value')),
    ).toEqual(['top', 'bottom', 'left', 'right'])
  })

  it.each([
    ['input', 'left', 'inputCableSide'],
    ['output', 'right', 'outputCableSide'],
    ['input', 'bottom', 'inputCableSide'],
  ] as const)(
    'changing the %s select to %s calls setCableSides: only that side changes',
    async (kind, value, key) => {
      const { wrapper, store } = await open()
      await select(wrapper, kind).setValue(value)
      expect(store.content?.[key]).toBe(value)
      const otherKey = key === 'inputCableSide' ? 'outputCableSide' : 'inputCableSide'
      expect(store.content?.[otherKey]).toBe(base[otherKey])
      expect(store.dirty).toBe(true)
    },
  )

  it('the change is one undo step and undo restores the sides and the routes', async () => {
    const wired = { ...base }
    const { wrapper, store } = await open(wired)
    store.apply(addAuto(30, cw(id(2)), pole(id(20), 0, 'input')), 'editor.history.addWire')
    const before = store.content
    await select(wrapper, 'input').setValue('left')
    expect(store.content?.inputCableSide).toBe('left')
    expect(store.content?.wires[0]?.bends).not.toEqual(before?.wires[0]?.bends)
    expect(store.undoLabel && t(store.undoLabel)).toBe('Змінити сторону кабелів')
    store.undo()
    expect(store.content).toBe(before)
    await nextTick()
    expect((select(wrapper, 'input').element as HTMLSelectElement).value).toBe('top')
  })

  it('selecting the same side records nothing', async () => {
    const { wrapper, store } = await open()
    await select(wrapper, 'input').setValue('top')
    expect(store.canUndo).toBe(false)
  })

  it('both selects may name the same side', async () => {
    const { wrapper, store } = await open()
    await select(wrapper, 'output').setValue('top')
    expect(store.content).toMatchObject({ inputCableSide: 'top', outputCableSide: 'top' })
  })

  it('both selects are disabled on a read-only panel and change nothing', async () => {
    const { wrapper, store } = await open(base, { deletedAt: '2026-02-01T00:00:00+00:00' })
    expect(select(wrapper, 'input').attributes('disabled')).toBeDefined()
    expect(select(wrapper, 'output').attributes('disabled')).toBeDefined()
    expect(store.canUndo).toBe(false)
  })

  it('a rejected change (drawing out of range) keeps the sides and shows an error', async () => {
    const huge = content({
      railWidthModules: 24,
      outputCableSide: 'right',
      outputCables: [outputCable(4, [5])],
      rails: [rail(10, 24, 99770, [element(20, 0, 2, 2)])],
    })
    const { wrapper, store, ctx } = await open(huge)
    await select(wrapper, 'output').setValue('bottom')
    expect(store.content?.outputCableSide).toBe('right')
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
  })
})

describe('toolbar: new cables have two wires, brown and blue', () => {
  const click = async (w: Wrapper, text: string) => {
    await w
      .findAll('button')
      .find((b) => b.text() === text)!
      .trigger('click')
  }

  it.each([
    ['Додати вхідний кабель', 'inputCables'],
    ['Додати вихідний кабель', 'outputCables'],
  ] as const)('"%s" adds a cable with the wires brown and blue', async (label, key) => {
    const { wrapper, store } = await mountEditor(base, { toolbar: true })
    await click(wrapper, label)
    const cables = store.content![key]
    const added = cables[cables.length - 1]!
    expect(added.wires.map((w) => w.colour)).toEqual(['brown', 'blue'])
    expect(new Set(added.wires.map((w) => w.id)).size).toBe(2)
  })
})

describe('panel properties: rejected side change resets the select', () => {
  const huge = content({
    railWidthModules: 24,
    outputCableSide: 'right',
    outputCables: [outputCable(4, [5])],
    rails: [rail(10, 24, 99770, [element(20, 0, 2, 2)])],
  })

  it('the select shows the stored side again after a rejection', async () => {
    const { wrapper, store } = await mountEditor(huge, { properties: true })
    const el = wrapper.get('[data-testid=output-cable-side]')
    await el.setValue('bottom')
    expect(store.content?.outputCableSide).toBe('right')
    expect((el.element as HTMLSelectElement).value).toBe('right')
  })

  it('an accepted change keeps the chosen value', async () => {
    const { wrapper, store } = await mountEditor(huge, { properties: true })
    const el = wrapper.get('[data-testid=output-cable-side]')
    await el.setValue('left')
    expect(store.content?.outputCableSide).toBe('left')
    expect((el.element as HTMLSelectElement).value).toBe('left')
  })
})
