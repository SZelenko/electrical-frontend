/** Stage 3 editor behaviour: ATS, terminal-row blocks, rail blocks, copy by Ctrl/Cmd+drag, side contacts. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { updateElement } from '@/domain/commands'
import { computeLayout, endpointPoint } from '@/domain/geometry'
import type { PanelContent } from '@/domain/panelContent'
import {
  addAuto,
  ats,
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  pole,
  rail,
  rowBlock,
  term,
} from '@/domain/__tests__/helpers'
import { mountEditor, pointer, stubLayout } from './harness'

/**
 * C1 (id2 brown, id3 blue); row: id50 [0,2) 3 contacts, id51 [6,7) 2 contacts;
 * R1 id10: ATS id21 [0,2), device id20 [4,6) 2 poles, rail block id40 [10,11) 3 contacts; R2 id11 empty.
 */
const base: PanelContent = content({
  inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
  terminalRow: [rowBlock(50, 0, 3), rowBlock(51, 6, 2)],
  rails: [
    rail(10, 24, 150, [ats(21, 0, 2), element(20, 4, 2, 2)], [block(40, 10, 1, 3)]),
    rail(11, 24, 100),
  ],
})

const layout = computeLayout(base)
const centreOf = (itemId: string) => {
  const b = layout.elements.get(itemId) ?? layout.blocks.get(itemId)!
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}
type Wrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']
const CTRL = { ctrlKey: true }

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

const itemSel = (n: number) => `[data-testid=element][data-id="${id(n)}"]`
const blockSel = (n: number) => `[data-testid=block][data-id="${id(n)}"]`

/** Drags an item from its centre to `to`, with modifier flags per event. */
async function drag(
  wrapper: Wrapper,
  selector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  mods: { move?: object; up?: object; down?: object } = {},
) {
  await wrapper.get(selector).trigger('pointerdown', pointer(wrapper, from, mods.down ?? {}))
  await wrapper.get('svg').trigger('pointermove', pointer(wrapper, to, mods.move ?? {}))
  await wrapper.get('svg').trigger('pointerup', pointer(wrapper, to, mods.up ?? {}))
}

describe('rendering of the new kinds', () => {
  it('renders the ATS with its kind marker and state indicator, the device without', async () => {
    const { wrapper } = await mountEditor(base)
    expect(wrapper.get(itemSel(21)).attributes('data-element-kind')).toBe('ats')
    expect(wrapper.get(itemSel(20)).attributes('data-element-kind')).toBeUndefined()
    expect(wrapper.get('[data-testid=ats-state]').attributes('data-state')).toBe('A')
  })

  it.each(['A', 'B', 'off'] as const)('the state indicator follows the state %s', async (state) => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(updateElement(id(21), { state }), 'x')
    await nextTick()
    expect(wrapper.get('[data-testid=ats-state]').attributes('data-state')).toBe(state)
  })

  it('marks blocks with their zone and renders the always-reserved terminal row', async () => {
    const { wrapper } = await mountEditor(base)
    expect(wrapper.get(blockSel(50)).attributes('data-block-zone')).toBe('row')
    expect(wrapper.get(blockSel(40)).attributes('data-block-zone')).toBe('rail')
    expect(wrapper.find('[data-testid=terminal-row]').exists()).toBe(true)
    const empty = await mountEditor(content())
    expect(empty.wrapper.find('[data-testid=terminal-row]').exists()).toBe(true)
  })

  it('offers 6 contacts on an ATS (4 inputs, 2 outputs), 2 per row contact and 2 per rail contact', async () => {
    const { wrapper } = await mountEditor(base)
    const count = (sel: string) => wrapper.findAll(sel).length
    expect(count(`[data-ep-kind=pole][data-ep-a="${id(21)}"][data-ep-side=input]`)).toBe(4)
    expect(count(`[data-ep-kind=pole][data-ep-a="${id(21)}"][data-ep-side=output]`)).toBe(2)
    expect(count(`[data-ep-kind=terminal][data-ep-a="${id(50)}"][data-ep-cs=top]`)).toBe(3)
    expect(count(`[data-ep-kind=terminal][data-ep-a="${id(50)}"][data-ep-cs=bottom]`)).toBe(3)
    expect(count(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-cs=left]`)).toBe(3)
    expect(count(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-cs=right]`)).toBe(3)
    expect(count(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-cs=top]`)).toBe(0)
    expect(count(`[data-ep-kind=terminal][data-ep-a="${id(50)}"][data-ep-cs=left]`)).toBe(0)
  })
})

describe('dragging ATS, rail blocks and row blocks (move)', () => {
  it('moves an ATS along its rail (one history entry)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(21))
    await drag(wrapper, itemSel(21), from, { x: from.x + 6 * 175, y: from.y })
    expect(store.content?.rails[0]?.elements.find((e) => e.id === id(21))?.offsetModules).toBe(6)
    expect(store.undoLabel).toBe('Перемістити апарат')
    expect(historyLength(store)).toBe(1)
  })

  it('moves a row block along the row (one entry, ids and count kept)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(50))
    await drag(wrapper, blockSel(50), from, { x: from.x + 2 * 175, y: from.y })
    const moved = store.content?.terminalRow.find((b) => b.id === id(50))
    expect(moved).toMatchObject({ offsetModules: 2, terminalCount: 3 })
    expect(store.undoLabel).toBe('Перемістити клемний блок')
    expect(historyLength(store)).toBe(1)
  })

  it('a row block dropped onto its neighbour is refused and the content stays', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const from = centreOf(id(50))
    const before = store.content
    await drag(wrapper, blockSel(50), from, { x: from.x + 5 * 175, y: from.y })
    expect(store.content).toBe(before)
    expect(ctx.notice.value?.tone).toBe('error')
    expect(ctx.notice.value?.text).toContain('Елемент повернено на місце')
  })

  it('a row block dragged off the row band shows its own hint and is not moved', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(50))
    await wrapper.get(blockSel(50)).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: from.x, y: 1000 })) // below the row band (200..450), above the rails
    expect(wrapper.get('.hint').text()).toBe('Перетягніть у рядок клемників')
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x, y: 1000 }))
    expect(store.canUndo).toBe(false)
  })

  it('a row block dropped onto a rail is refused with the zone message', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(50))
    await wrapper.get(blockSel(50)).trigger('pointerdown', pointer(wrapper, from))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: from.x, y: layout.rails[1]!.cy }))
    expect(wrapper.get('.hint').text()).toBe('Клемник рядка не можна перенести на рейку')
    expect(wrapper.find('[data-testid=invalid-ghost]').exists()).toBe(true)
    await wrapper
      .get('svg')
      .trigger('pointerup', pointer(wrapper, { x: from.x, y: layout.rails[1]!.cy }))
    expect(store.canUndo).toBe(false)
  })

  it('a rail item dropped into the row is refused with the zone message', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(40))
    await wrapper.get(blockSel(40)).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: from.x, y: 325 })) // inside the row band (200..450)
    expect(wrapper.get('.hint').text()).toBe('Елемент рейки не можна перенести в рядок клемників')
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x, y: 325 }))
    expect(store.canUndo).toBe(false)
  })

  it('a read-only panel starts no drag of a row block', async () => {
    const { wrapper, store } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    const from = centreOf(id(50))
    await drag(wrapper, blockSel(50), from, { x: from.x + 350, y: from.y }, { up: CTRL })
    expect(store.canUndo).toBe(false)
    expect(store.content?.terminalRow.map((b) => b.offsetModules)).toEqual([0, 6])
  })
})

describe('copy by Ctrl/Cmd + drag', () => {
  it('Ctrl at the drop copies an element to another rail: new id, original stays, one entry, copy selected', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(20))
    await drag(wrapper, itemSel(20), from, { x: from.x, y: layout.rails[1]!.cy }, { up: CTRL })
    expect(store.content?.rails[0]?.elements.map((e) => e.id)).toContain(id(20))
    const copies = store.content!.rails[1]!.elements
    expect(copies).toHaveLength(1)
    expect(copies[0]!.id).not.toBe(id(20))
    expect(copies[0]).toMatchObject({ kind: 'device', widthModules: 2, offsetModules: 4 })
    expect(store.selection).toEqual({ kind: 'element', id: copies[0]!.id })
    expect(store.undoLabel).toBe('Копіювати')
    expect(historyLength(store)).toBe(1)
  })

  it('Cmd (meta) works like Ctrl', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(20))
    await drag(
      wrapper,
      itemSel(20),
      from,
      { x: from.x, y: layout.rails[1]!.cy },
      { up: { metaKey: true } },
    )
    expect(store.content?.rails[1]?.elements).toHaveLength(1)
    expect(store.undoLabel).toBe('Копіювати')
  })

  it('does not copy the wires of the original', async () => {
    const wired = { ...base, wires: [] as PanelContent['wires'] }
    const { wrapper, store } = await mountEditor(wired)
    store.apply(addAuto(30, cw(id(2)), pole(id(20), 0, 'input')), 'w')
    const from = centreOf(id(20))
    await drag(wrapper, itemSel(20), from, { x: from.x, y: layout.rails[1]!.cy }, { up: CTRL })
    expect(store.content?.wires).toHaveLength(1)
    expect(store.content?.wires[0]?.end).toEqual(pole(id(20), 0, 'input'))
  })

  it('copies an ATS keeping its state, label and width', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(updateElement(id(21), { state: 'B', label: 'QA1' }), 'x')
    const from = centreOf(id(21))
    await drag(wrapper, itemSel(21), from, { x: from.x, y: layout.rails[1]!.cy }, { up: CTRL })
    expect(store.content?.rails[1]?.elements[0]).toMatchObject({
      kind: 'ats',
      state: 'B',
      label: 'QA1',
      widthModules: 2,
    })
  })

  it('copies a rail block to another rail', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(40))
    await drag(wrapper, blockSel(40), from, { x: from.x, y: layout.rails[1]!.cy }, { up: CTRL })
    const copy = store.content?.rails[1]?.terminalBlocks[0]
    expect(copy).toMatchObject({ terminalCount: 3, widthModules: 1, offsetModules: 10 })
    expect(copy?.id).not.toBe(id(40))
    expect(store.selection).toEqual({ kind: 'block', id: copy!.id })
  })

  it('copies a row block within the row (one entry, copy selected)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(50))
    await drag(wrapper, blockSel(50), from, { x: from.x + 10 * 175, y: from.y }, { up: CTRL })
    expect(store.content?.terminalRow).toHaveLength(3)
    const copy = store.content!.terminalRow.find((b) => b.offsetModules === 10)!
    expect(copy).toMatchObject({ terminalCount: 3, widthModules: 2 })
    expect(copy.id).not.toBe(id(50))
    expect(store.selection).toEqual({ kind: 'block', id: copy.id })
    expect(store.undoLabel).toBe('Копіювати')
    expect(historyLength(store)).toBe(1)
  })

  it('undo removes the copy in one step', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(50))
    await drag(wrapper, blockSel(50), from, { x: from.x + 10 * 175, y: from.y }, { up: CTRL })
    store.undo()
    expect(store.content?.terminalRow).toHaveLength(2)
  })

  it('the modifier is read at the drop: Ctrl only on pointermove still moves', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(20))
    await drag(wrapper, itemSel(20), from, { x: from.x, y: layout.rails[1]!.cy }, { move: CTRL })
    expect(store.content?.rails[0]?.elements.map((e) => e.id)).not.toContain(id(20))
    expect(store.content?.rails[1]?.elements.map((e) => e.id)).toEqual([id(20)])
    expect(store.undoLabel).toBe('Перемістити апарат')
  })

  it('Ctrl held at pointermove shows the copy ghost and leaves the original in place (no preview)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(20))
    const to = { x: from.x, y: layout.rails[1]!.cy }
    await wrapper.get(itemSel(20)).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, to, CTRL))
    expect(wrapper.find('[data-testid=copy-ghost]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=invalid-ghost]').exists()).toBe(false)
    expect(store.content?.rails[0]?.elements.map((e) => e.id)).toContain(id(20))
    // releasing the modifier before the drop turns the ghost into a normal move preview
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, to))
    expect(wrapper.find('[data-testid=copy-ghost]').exists()).toBe(false)
  })

  it('a copy dropped on its own position is an overlap: invalid ghost, nothing created', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const from = centreOf(id(20))
    const to = { x: from.x, y: from.y + 100 } // same rail, same offset
    await wrapper.get(itemSel(20)).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, to, CTRL))
    expect(wrapper.find('[data-testid=invalid-ghost]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=copy-ghost]').exists()).toBe(false)
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, to, CTRL))
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.text).toContain('Копію не створено')
  })

  it('a copy onto another element is refused with the reason and the "copy not created" note', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const from = centreOf(id(20))
    const to = { x: centreOf(id(21)).x, y: from.y }
    await drag(wrapper, itemSel(20), from, to, { move: CTRL, up: CTRL })
    expect(store.content?.rails[0]?.elements).toHaveLength(2)
    expect(ctx.notice.value?.tone).toBe('error')
    expect(ctx.notice.value?.text).toMatch(/Копію не створено\.$/)
  })

  it.each([
    ['a device into the row', itemSel(20), centreOf(id(20)), { x: centreOf(id(20)).x, y: 700 }],
    ['an ATS into the row', itemSel(21), centreOf(id(21)), { x: centreOf(id(21)).x, y: 700 }],
    [
      'a rail block into the row',
      blockSel(40),
      centreOf(id(40)),
      { x: centreOf(id(40)).x, y: 700 },
    ],
    [
      'a row block onto a rail',
      blockSel(50),
      centreOf(id(50)),
      { x: centreOf(id(50)).x, y: layout.rails[1]!.cy },
    ],
  ])('cross-zone copy of %s is invalid: nothing is created', async (_n, sel, from, to) => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const before = store.content
    await wrapper.get(sel).trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, to, CTRL))
    expect(wrapper.find('[data-testid=invalid-ghost]').exists()).toBe(true)
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, to, CTRL))
    expect(store.content).toBe(before)
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.text).toContain('Копію не створено')
  })

  it('Ctrl+click without moving only selects (no copy)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centreOf(id(20))
    await wrapper.get(itemSel(20)).trigger('pointerdown', pointer(wrapper, from, CTRL))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, from, CTRL))
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
    expect(store.canUndo).toBe(false)
    expect(store.content?.rails[0]?.elements).toHaveLength(2)
  })

  it('the browser context menu is prevented over the canvas', async () => {
    const { wrapper } = await mountEditor(base)
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    wrapper.get('svg').element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('a read-only panel never copies', async () => {
    const { wrapper, store } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    const from = centreOf(id(20))
    await drag(wrapper, itemSel(20), from, { x: from.x, y: layout.rails[1]!.cy }, { up: CTRL })
    expect(store.content?.rails[1]?.elements).toHaveLength(0)
  })
})

describe('drawing from side contacts', () => {
  const contact = (wrapper: Wrapper, blockId: number, i: number, side: string) =>
    wrapper.get(
      `[data-ep-kind=terminal][data-ep-a="${id(blockId)}"][data-ep-b="${i}"][data-ep-cs=${side}]`,
    )
  const down = { button: 0, pointerId: 1 }

  it('a rail block contact wired from the left: start records the side and the ring sits on that side', async () => {
    const { wrapper, ctx } = await mountEditor(base)
    await contact(wrapper, 40, 1, 'left').trigger('pointerdown', down)
    expect(ctx.drawing.value?.start).toEqual(term(id(40), 1, 'left'))
    const ring = wrapper.get('[data-testid=drawing-start]')
    const p = endpointPoint(layout, term(id(40), 1, 'left'))!
    expect([ring.attributes('cx'), ring.attributes('cy')]).toEqual([String(p.x), String(p.y)])
  })

  it('a wire from the right of a rail contact to an ATS input is stored with that side', async () => {
    const { wrapper, store } = await mountEditor(base)
    await contact(wrapper, 40, 1, 'right').trigger('pointerdown', down)
    await wrapper
      .get(`[data-ep-kind=pole][data-ep-a="${id(21)}"][data-ep-b="3"][data-ep-side=input]`)
      .trigger('pointerdown', down)
    const wire = store.content!.wires[0]!
    expect(wire.start).toEqual(term(id(40), 1, 'right'))
    expect(wire.end).toEqual(pole(id(21), 3, 'input'))
    expect(store.undoLabel).toBe('Додати провід')
  })

  it('a wire ending on a left contact arrives horizontally (the single elbow is level with the contact)', async () => {
    const { wrapper, store } = await mountEditor(base)
    await wrapper.get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`).trigger('pointerdown', down)
    await contact(wrapper, 40, 1, 'left').trigger('pointerdown', down)
    const end = endpointPoint(layout, term(id(40), 1, 'left'))!
    const bends = store.content!.wires[0]!.bends
    expect(bends.slice(-1)[0]?.y).toBe(end.y)
    expect(bends).toEqual([{ x: 300, y: end.y }])
  })

  it('a row block: from the top of contact 0 to the bottom of contact 2', async () => {
    const { wrapper, store } = await mountEditor(base)
    await contact(wrapper, 50, 0, 'top').trigger('pointerdown', down)
    await contact(wrapper, 50, 2, 'bottom').trigger('pointerdown', down)
    const wire = store.content!.wires[0]!
    expect([wire.start, wire.end]).toEqual([term(id(50), 0, 'top'), term(id(50), 2, 'bottom')])
  })

  it('a click on the other side of the start contact cancels (same node): nothing is created', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await contact(wrapper, 50, 1, 'top').trigger('pointerdown', down)
    await contact(wrapper, 50, 1, 'bottom').trigger('pointerdown', down)
    expect(ctx.drawing.value).toBeNull()
    expect(store.content?.wires).toHaveLength(0)
    expect(store.canUndo).toBe(false)
  })

  it('the same for the two sides of a rail contact', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await contact(wrapper, 40, 0, 'left').trigger('pointerdown', down)
    await contact(wrapper, 40, 0, 'right').trigger('pointerdown', down)
    expect(ctx.drawing.value).toBeNull()
    expect(store.content?.wires).toHaveLength(0)
  })

  it('a coloured block gives the default wire colour; the toolbar colour only applies to grey blocks', async () => {
    const coloured: PanelContent = {
      ...base,
      terminalRow: base.terminalRow.map((b, i) => (i === 0 ? { ...b, colour: 'red' } : b)),
    }
    const { wrapper, ctx } = await mountEditor(coloured)
    ctx.wireColour.value = 'black'
    await contact(wrapper, 50, 0, 'top').trigger('pointerdown', down)
    expect(ctx.drawing.value?.colour).toBe('red')
    ctx.cancelDrawing()
    await contact(wrapper, 51, 0, 'top').trigger('pointerdown', down)
    expect(ctx.drawing.value?.colour).toBe('black')
  })

  it('the wire is drawn with the stored sides: its path starts at the side point', async () => {
    const { wrapper, store } = await mountEditor(base)
    await contact(wrapper, 50, 0, 'bottom').trigger('pointerdown', down)
    await wrapper
      .get(`[data-ep-kind=pole][data-ep-a="${id(21)}"][data-ep-b="0"][data-ep-side=input]`)
      .trigger('pointerdown', down)
    await nextTick()
    const start = endpointPoint(layout, term(id(50), 0, 'bottom'))!
    expect(wrapper.get('[data-testid=wire]').attributes('d')).toMatch(
      new RegExp(`^M${start.x} ${start.y} `),
    )
    expect(store.content?.wires).toHaveLength(1)
  })
})
