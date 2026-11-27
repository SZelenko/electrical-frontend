import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { panelsApi } from '@/api/panels'
import { updateInputCable } from '@/domain/commands'
import { computeLayout, endpointPoint } from '@/domain/geometry'
import type { PanelContent } from '@/domain/panelContent'
import {
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  pole,
  rail,
  run,
  addAuto,
} from '@/domain/__tests__/helpers'
import { mountEditor, panelOf, pointer, stubLayout } from './harness'

/** C1 (id2, id3); R1 id10 24 modules: E1 id20 [0,2) 2 poles, E2 id21 [4,5) 1 pole, B1 id40 [8,10) 2 terminals; R2 id11 empty. */
const base: PanelContent = content({
  inputCables: [inputCable(1, [2, 3])],
  rails: [
    rail(10, 24, 150, [element(20, 0, 2, 2), element(21, 4, 1, 1)], [block(40, 8, 2, 2)]),
    rail(11, 24, 100),
  ],
})
const wired = run(base, addAuto(30, cw(id(2)), pole(id(20), 0, 'input'))).content

const layoutOf = (c: PanelContent) => computeLayout(c)
const centre = (c: PanelContent, elementId: string) => {
  const b = layoutOf(c).elements.get(elementId)!
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Number of history entries (undo until empty). */
function historyLength(store: { undo: () => string | null }): number {
  let n = 0
  while (store.undo() !== null) n++
  return n
}

describe('PanelCanvas: dragging devices', () => {
  it('commits exactly one history entry for a whole drag along the rail', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centre(base, id(21))
    const svg = wrapper.get('svg')
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    for (const dx of [20, 100, 250, 350]) {
      await svg.trigger('pointermove', pointer(wrapper, { x: from.x + dx, y: from.y }))
      expect(store.dirty).toBe(false) // nothing is committed while dragging
    }
    await svg.trigger('pointerup', pointer(wrapper, { x: from.x + 350, y: from.y }))
    expect(store.content?.rails[0]?.elements.find((e) => e.id === id(21))?.offsetModules).toBe(6)
    expect(store.dirty).toBe(true)
    expect(store.undoLabel).toBe('Перемістити апарат')
    expect(historyLength(store)).toBe(1)
    expect(store.content).toBe(store.savedContent)
  })

  it('a click without movement selects the element and records nothing', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centre(base, id(21))
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, from))
    expect(store.selection).toEqual({ kind: 'element', id: id(21) })
    expect(store.canUndo).toBe(false)
  })

  it('a movement under 4 px is still a click', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centre(base, id(21))
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: from.x + 20, y: from.y })) // 2 px
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x + 20, y: from.y }))
    expect(store.canUndo).toBe(false)
  })

  it('moves an element to another rail keeping its id (one entry)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const l = layoutOf(base)
    const from = centre(base, id(21))
    const target = { x: from.x, y: l.rails[1]!.cy }
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, target))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, target))
    expect(store.content?.rails[0]?.elements.map((e) => e.id)).toEqual([id(20)])
    expect(store.content?.rails[1]?.elements.map((e) => e.id)).toEqual([id(21)])
    expect(historyLength(store)).toBe(1)
  })

  it('an invalid drop (onto another element) shows the message, keeps the content and records nothing', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const from = centre(base, id(21))
    const onE1 = { x: centre(base, id(20)).x, y: from.y }
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, onE1))
    expect(wrapper.get('.hint').text()).toBe('Місце зайняте іншим елементом')
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, onE1))
    expect(store.content).toBe(store.savedContent)
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value).toEqual({
      text: 'Місце зайняте іншим елементом. Елемент повернено на місце.',
      tone: 'error',
    })
    expect(wrapper.find('.hint').exists()).toBe(false)
  })

  it('a drop off the rails is rejected with its own message', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const from = centre(base, id(21))
    const off = { x: from.x, y: 100 } // inside the cable row, far from any rail
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, off))
    expect(wrapper.get('.hint').text()).toBe('Перетягніть на рейку')
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, off))
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.text).toContain('повернено на місце')
  })

  it('a drop past the rail end is rejected', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centre(base, id(21))
    const past = { x: 200 + 24 * 175 + 400, y: from.y }
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, past))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, past))
    expect(store.canUndo).toBe(false)
  })

  it('drags a terminal block too (label differs)', async () => {
    const { wrapper, store } = await mountEditor(base)
    const b = layoutOf(base).blocks.get(id(40))!
    const from = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    await wrapper
      .get(`[data-kind=block][data-id="${id(40)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: from.x + 350, y: from.y }))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x + 350, y: from.y }))
    expect(store.content?.rails[0]?.terminalBlocks[0]?.offsetModules).toBe(10)
    expect(store.undoLabel).toBe('Перемістити клемний блок')
  })

  it('a pointercancel abandons the drag without committing', async () => {
    const { wrapper, store } = await mountEditor(base)
    const from = centre(base, id(21))
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: from.x + 350, y: from.y }))
    await wrapper.get('svg').trigger('pointercancel', pointer(wrapper, from))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x + 350, y: from.y }))
    expect(store.canUndo).toBe(false)
  })

  it('a trashed (read-only) panel cannot be dragged', async () => {
    const { wrapper, store } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    const from = centre(base, id(21))
    await wrapper
      .get(`[data-testid=element][data-id="${id(21)}"]`)
      .trigger('pointerdown', pointer(wrapper, from))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: from.x + 350, y: from.y }))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: from.x + 350, y: from.y }))
    expect(store.dirty).toBe(false)
    expect(store.canUndo).toBe(false)
  })
})

describe('PanelCanvas: drawing a wire', () => {
  it('click on a start terminal then on an end terminal creates one wire (one entry, selected)', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(ctx.drawing.value).toEqual(
      expect.objectContaining({ start: cw(id(2)), bends: [], colour: 'brown' }),
    )
    expect(wrapper.get('.hint').text()).toContain('Клацайте на полі, щоб додати злам')
    await wrapper
      .get(`[data-ep-kind=pole][data-ep-a="${id(20)}"][data-ep-b="0"][data-ep-side=input]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.content?.wires).toHaveLength(1)
    const wire = store.content!.wires[0]!
    expect(wire.start).toEqual(cw(id(2)))
    expect(wire.end).toEqual(pole(id(20), 0, 'input'))
    expect(wire.bends).toEqual([{ x: 288, y: 450 }]) // no clicks in between: exactly one elbow
    expect(store.selection).toEqual({ kind: 'wire', id: wire.id })
    expect(ctx.drawing.value).toBeNull()
    expect(store.undoLabel).toBe('Додати провід')
    expect(historyLength(store)).toBe(1)
    expect(wrapper.find('.hint').exists()).toBe(false)
  })

  it('a second click on the same terminal cancels drawing and adds nothing', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    const sel = `[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`
    await wrapper.get(sel).trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(ctx.drawing.value).not.toBeNull()
    await wrapper.get(sel).trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(ctx.drawing.value).toBeNull()
    expect(store.content?.wires).toHaveLength(0)
    expect(store.canUndo).toBe(false)
  })

  it('Escape cancels drawing', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(ctx.drawing.value).toBeNull()
    expect(wrapper.find('.hint').exists()).toBe(false)
    expect(store.content?.wires).toHaveLength(0)
  })

  it('shows a rubber-band line from the start terminal while the pointer moves', async () => {
    const { wrapper } = await mountEditor(base)
    expect(wrapper.find('polyline.rubber').exists()).toBe(false)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: 800, y: 900 }))
    expect(wrapper.find('polyline.rubber').exists()).toBe(true)
  })

  it('drawing between two terminal blocks terminals works too and the wire is selected', async () => {
    const { wrapper, store } = await mountEditor(base)
    await wrapper
      .get(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-b="0"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    await wrapper
      .get(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-b="1"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.content?.wires).toHaveLength(1)
  })

  it('a read-only panel does not start a wire', async () => {
    const { wrapper, ctx } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(ctx.drawing.value).toBeNull()
  })

  it('a rejected wire (the wire limit) reports it and records nothing', async () => {
    const full: PanelContent = {
      ...base,
      wires: Array.from({ length: 5000 }, (_, i) => ({
        id: id(10000 + i),
        colour: 'brown' as const,
        crossSection: '2.5' as const,
        start: cw(id(2)),
        end: cw(id(3)),
        bends: [],
      })),
    }
    const { wrapper, ctx } = await mountEditor(full)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(ctx.drawing.value).toBeNull()
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it('undo while drawing cancels the pending wire', async () => {
    const { wrapper, ctx, store } = await mountEditor(base)
    store.apply(addAuto(31, cw(id(3)), pole(id(21), 0, 'input')), 'x')
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    ctx.undo()
    expect(ctx.drawing.value).toBeNull()
  })
})

describe('PanelCanvas: bend editing', () => {
  /** W1 cw2 (300,450) -> E1.p0 in (288,2050); auto bends (300,1250), (288,1250). */
  const select = async (wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper']) => {
    await wrapper.get('[data-testid=wire]').trigger('pointerdown', { button: 0, pointerId: 1 })
  }

  it('selecting a wire shows one handle per bend', async () => {
    const { wrapper, store } = await mountEditor(wired)
    expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(0)
    await select(wrapper)
    expect(store.selection).toEqual({ kind: 'wire', id: id(30) })
    expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(2)
  })

  it('dragging a bend commits one entry with the dragged position and aligned neighbour', async () => {
    const { wrapper, store } = await mountEditor(wired)
    await select(wrapper)
    const start = { x: 300, y: 1250 }
    await wrapper
      .get('[data-testid=bend][data-index="0"]')
      .trigger('pointerdown', pointer(wrapper, start))
    for (const y of [1000, 950, 900]) {
      await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: 330, y }))
      expect(store.dirty).toBe(false)
    }
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: 330, y: 900 }))
    expect(store.content?.wires[0]?.bends).toEqual([
      { x: 300, y: 900 }, // x locked by the cable wire terminal
      { x: 288, y: 900 },
    ])
    expect(store.undoLabel).toBe('Перемістити злам')
    expect(historyLength(store)).toBe(1)
  })

  it('a bend pointerdown without movement commits nothing', async () => {
    const { wrapper, store } = await mountEditor(wired)
    await select(wrapper)
    await wrapper
      .get('[data-testid=bend][data-index="0"]')
      .trigger('pointerdown', pointer(wrapper, { x: 300, y: 1250 }))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: 300, y: 1250 }))
    expect(store.dirty).toBe(false)
  })

  it('double-click on a wire segment inserts a collinear bend (one entry)', async () => {
    const { wrapper, store } = await mountEditor(wired)
    await select(wrapper)
    await wrapper
      .get('[data-testid=wire]')
      .trigger('dblclick', pointer(wrapper, { x: 294, y: 1250 }))
    const bends = store.content!.wires[0]!.bends
    expect(bends).toHaveLength(3)
    expect(bends[1]).toEqual({ x: 294, y: 1250 })
    expect(store.undoLabel).toBe('Додати злам')
    expect(historyLength(store)).toBe(1)
  })

  it('double-click on a bend handle removes it (one entry) and keeps the wire orthogonal', async () => {
    const { wrapper, store } = await mountEditor(wired)
    await select(wrapper)
    await wrapper
      .get('[data-testid=wire]')
      .trigger('dblclick', pointer(wrapper, { x: 294, y: 1250 }))
    expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(3)
    await wrapper
      .get('[data-testid=bend][data-index="1"]')
      .trigger('dblclick', pointer(wrapper, { x: 294, y: 1250 }))
    expect(store.content?.wires[0]?.bends).toEqual([
      { x: 300, y: 1250 },
      { x: 288, y: 1250 },
    ])
    expect(store.undoLabel).toBe('Видалити злам')
    const l = computeLayout(store.content!)
    const w = store.content!.wires[0]!
    const pts = [endpointPoint(l, w.start)!, ...w.bends, endpointPoint(l, w.end)!]
    expect(pts.every((a, i) => !pts[i + 1] || a.x === pts[i + 1]!.x || a.y === pts[i + 1]!.y)).toBe(
      true,
    )
  })

  it('a double-click on empty background does nothing', async () => {
    const { wrapper, store } = await mountEditor(wired)
    await wrapper.get('svg').trigger('dblclick', pointer(wrapper, { x: 5000, y: 500 }))
    expect(store.dirty).toBe(false)
  })

  it('the bend handles are not offered on a read-only panel', async () => {
    const { wrapper } = await mountEditor(wired, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    await select(wrapper)
    expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(0)
  })
})

describe('PanelCanvas: selection', () => {
  it('clicking the background deselects', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.select({ kind: 'element', id: id(20) })
    await wrapper.get('[data-kind=background]').trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.selection).toBeNull()
  })

  it('clicking a rail, a cable or a wire selects it', async () => {
    const { wrapper, store } = await mountEditor(wired)
    await wrapper.get('[data-testid=rail]').trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.selection).toEqual({ kind: 'rail', id: id(10) })
    await wrapper
      .get('[data-testid=input-cable]')
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.selection).toEqual({ kind: 'inputCable', id: id(1) })
    await wrapper.get('[data-testid=wire]').trigger('pointerdown', { button: 0, pointerId: 1 })
    expect(store.selection).toEqual({ kind: 'wire', id: id(30) })
  })

  it('a non-primary button is ignored', async () => {
    const { wrapper, store } = await mountEditor(base)
    await wrapper.get('[data-testid=rail]').trigger('pointerdown', { button: 2, pointerId: 1 })
    expect(store.selection).toBeNull()
  })

  it('short-circuit wires get a halo path', async () => {
    const shorted = run(wired, addAuto(31, cw(id(3)), cw(id(2)))).content
    const group = { sources: [id(2), id(3)], wireIds: [id(31)], terminals: [] }
    const { wrapper } = await mountEditor(shorted, { panel: { shortCircuits: [group] } }) // the backend answer is shown while clean
    const halos = wrapper.findAll('path[stroke="#ff00ff"]')
    expect(halos.length).toBeGreaterThan(0)
  })

  it('a wire without a short circuit has no halo', async () => {
    const { wrapper } = await mountEditor(wired)
    expect(wrapper.findAll('path[stroke="#ff00ff"]')).toHaveLength(0)
  })
})

describe('PanelCanvas: manual wire drawing (W1)', () => {
  const start = (wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'], wireId = id(2)) =>
    wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${wireId}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
  const poleIn = (wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
    wrapper
      .get(`[data-ep-kind=pole][data-ep-a="${id(20)}"][data-ep-b="0"][data-ep-side=input]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
  /** A click on empty canvas at a drawing point: pointerdown and pointerup on the background. */
  async function clickAt(
    wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'],
    u: { x: number; y: number },
  ) {
    await wrapper.get('[data-kind=background]').trigger('pointerdown', pointer(wrapper, u))
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, u))
  }

  it('each click off a contact adds a bend snapped to the closer axis; the end click adds one elbow', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await start(wrapper)
    await clickAt(wrapper, { x: 305, y: 900 }) // closer to the vertical axis of (300,450)
    expect(ctx.drawing.value?.bends).toEqual([{ x: 300, y: 900 }])
    await clickAt(wrapper, { x: 700, y: 905 }) // closer to the horizontal axis of (300,900)
    expect(ctx.drawing.value?.bends).toEqual([
      { x: 300, y: 900 },
      { x: 700, y: 900 },
    ])
    await poleIn(wrapper)
    const wire = store.content!.wires[0]!
    expect(wire.bends).toEqual([
      { x: 300, y: 900 },
      { x: 700, y: 900 },
      { x: 288, y: 900 }, // the single elbow in front of the contact
    ])
    expect(store.undoLabel).toBe('Додати провід')
    expect(historyLength(store)).toBe(1)
  })

  it('a click on a rail or a device while drawing adds a bend at once (no pan)', async () => {
    const { wrapper, ctx } = await mountEditor(base)
    await start(wrapper)
    await wrapper
      .get('[data-testid=rail]')
      .trigger('pointerdown', pointer(wrapper, { x: 305, y: 2100 }))
    expect(ctx.drawing.value?.bends).toEqual([{ x: 300, y: 2100 }])
  })

  it('a background click moves less than 4 px adds a bend; a drag of 4 px or more pans instead', async () => {
    const { wrapper, ctx } = await mountEditor(base)
    await start(wrapper)
    const at = { x: 800, y: 460 }
    await wrapper.get('[data-kind=background]').trigger('pointerdown', pointer(wrapper, at))
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: at.x + 20, y: at.y })) // 2 px
    await wrapper.get('svg').trigger('pointerup', pointer(wrapper, { x: at.x + 20, y: at.y }))
    expect(ctx.drawing.value?.bends).toHaveLength(1)

    const before = wrapper.get('svg').attributes('viewBox')
    await wrapper.get('[data-kind=background]').trigger('pointerdown', pointer(wrapper, at))
    await wrapper
      .get('svg')
      .trigger('pointermove', pointer(wrapper, { x: at.x + 200, y: at.y + 100 })) // 20 px
    await wrapper
      .get('svg')
      .trigger('pointerup', pointer(wrapper, { x: at.x + 200, y: at.y + 100 }))
    expect(ctx.drawing.value?.bends).toHaveLength(1) // no second bend
    expect(wrapper.get('svg').attributes('viewBox')).not.toBe(before) // the view panned
    expect(ctx.drawing.value).not.toBeNull() // drawing continues
  })

  it('a click exactly on the last point is ignored', async () => {
    const { wrapper, ctx } = await mountEditor(base)
    await start(wrapper)
    await clickAt(wrapper, { x: 300, y: 450 })
    expect(ctx.drawing.value?.bends).toEqual([])
  })

  it('Backspace removes the last bend while drawing and never deletes the selection', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    store.select({ kind: 'element', id: id(21) })
    await start(wrapper)
    await clickAt(wrapper, { x: 300, y: 900 })
    await clickAt(wrapper, { x: 700, y: 900 })
    const bs = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true })
    window.dispatchEvent(bs)
    expect(bs.defaultPrevented).toBe(true)
    expect(ctx.drawing.value?.bends).toEqual([{ x: 300, y: 900 }])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' })) // nothing left to remove
    expect(ctx.drawing.value?.bends).toEqual([])
    expect(ctx.drawing.value).not.toBeNull()
    expect(store.content?.rails[0]?.elements).toHaveLength(2) // the selected element is still there
  })

  it('Escape and a click on the start contact cancel drawing and leave nothing behind', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await start(wrapper)
    await clickAt(wrapper, { x: 300, y: 900 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ctx.drawing.value).toBeNull()
    await start(wrapper)
    await clickAt(wrapper, { x: 300, y: 900 })
    await start(wrapper) // second click on the start contact
    expect(ctx.drawing.value).toBeNull()
    expect(store.canUndo).toBe(false)
    expect(store.content?.wires).toHaveLength(0)
  })

  describe('the 50-bend cap', () => {
    /** 50 vertical bends from the start contact (300,450): ends at (300,990); the pole input is at (288,2050). */
    const fifty = Array.from({ length: 50 }, (_, i) => ({ x: 300, y: 500 + 10 * i }))

    it('refuses a 51st bend with a hint and keeps the drawing', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      ctx.drawing.value = { ...ctx.drawing.value!, bends: fifty }
      await clickAt(wrapper, { x: 900, y: 990 })
      expect(ctx.drawing.value?.bends).toHaveLength(50)
      expect(ctx.notice.value).toEqual({
        text: 'Досягнуто ліміт зламів проводу (50). Завершіть провід на виводі.',
        tone: 'error',
      })
      expect(store.canUndo).toBe(false)
    })

    it('finishing 50 bends on an unaligned contact is refused (the elbow would be the 51st) and keeps the drawing', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      ctx.drawing.value = { ...ctx.drawing.value!, bends: fifty }
      const wiresBefore = store.content!.wires
      await poleIn(wrapper)
      expect(ctx.notice.value).toEqual({
        text: 'Забагато зламів: вирівняйте останній злам із виводом або приберіть злам.',
        tone: 'error',
      })
      expect(ctx.drawing.value?.bends).toHaveLength(50)
      expect(store.content!.wires).toBe(wiresBefore)
      expect(store.canUndo).toBe(false)
    })

    it('finishing 50 bends on an aligned contact succeeds', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      // the last bend (300,2050) shares y with the pole input (288,2050): no elbow needed
      const aligned = [...fifty.slice(0, 49), { x: 300, y: 2050 }]
      ctx.drawing.value = { ...ctx.drawing.value!, bends: aligned }
      await poleIn(wrapper)
      expect(store.content!.wires).toHaveLength(1)
      expect(store.content!.wires[0]!.bends).toEqual(aligned)
      expect(ctx.drawing.value).toBeNull()
      expect(store.undoLabel).toBe('Додати провід')
    })
  })

  it('accepts the 50th bend', async () => {
    const { wrapper, ctx } = await mountEditor(base)
    await start(wrapper)
    ctx.drawing.value = {
      ...ctx.drawing.value!,
      bends: Array.from({ length: 49 }, (_, i) => ({ x: 300, y: 500 + 10 * i })),
    }
    await clickAt(wrapper, { x: 900, y: 990 }) // last bend (300, 980): vertical axis
    expect(ctx.drawing.value?.bends).toHaveLength(50)
    expect(ctx.notice.value).toBeNull()
  })

  it('the rubber band follows start, bends and the pointer snapped to an axis', async () => {
    const { wrapper } = await mountEditor(base)
    await start(wrapper)
    await clickAt(wrapper, { x: 300, y: 900 })
    await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: 700, y: 905 }))
    expect(wrapper.get('polyline.rubber').attributes('points')).toBe('300,450 300,900 700,900')
  })

  describe('colour from the start contact (W3)', () => {
    it('a cable wire contact gives its colour, not the toolbar colour', async () => {
      const coloured: PanelContent = {
        ...base,
        inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
      }
      const { wrapper, store, ctx } = await mountEditor(coloured)
      ctx.wireColour.value = 'red'
      await start(wrapper, id(3)) // the blue wire
      expect(ctx.drawing.value?.colour).toBe('blue')
      await wrapper
        .get(`[data-ep-kind=pole][data-ep-a="${id(20)}"][data-ep-b="1"][data-ep-side=input]`)
        .trigger('pointerdown', { button: 0, pointerId: 1 })
      expect(store.content?.wires[0]?.colour).toBe('blue')
    })

    it('a pole with an attached wire gives that wire colour', async () => {
      const coloured: PanelContent = {
        ...wired,
        wires: wired.wires.map((w) => ({ ...w, colour: 'green-yellow' as const })),
      }
      const { wrapper, ctx } = await mountEditor(coloured)
      ctx.wireColour.value = 'red'
      await wrapper
        .get(`[data-ep-kind=pole][data-ep-a="${id(20)}"][data-ep-b="0"][data-ep-side=input]`)
        .trigger('pointerdown', { button: 0, pointerId: 1 })
      expect(ctx.drawing.value?.colour).toBe('green-yellow')
    })

    it('a free contact uses the toolbar colour', async () => {
      const { wrapper, ctx } = await mountEditor(base)
      ctx.wireColour.value = 'red'
      await wrapper
        .get(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-b="0"]`)
        .trigger('pointerdown', { button: 0, pointerId: 1 })
      expect(ctx.drawing.value?.colour).toBe('red')
    })
  })

  it('shows the drawing hint with the Backspace / Ctrl+Z / Esc instructions', async () => {
    const { wrapper } = await mountEditor(base)
    expect(wrapper.find('.hint').exists()).toBe(false)
    await start(wrapper)
    expect(wrapper.get('.hint').text()).toBe(
      'Клацайте на полі, щоб додати злам, і на виводі, щоб завершити провід. Backspace або Ctrl+Z — прибрати останній злам, Esc — скасувати.',
    )
  })

  describe('a rejected wire keeps the drawing', () => {
    it('a non-orthogonal route is rejected by addWire: error notice, drawing and history kept', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      const diagonal = [{ x: 400, y: 900 }]
      ctx.drawing.value = { ...ctx.drawing.value!, bends: diagonal }
      const wiresBefore = store.content!.wires
      await poleIn(wrapper)
      expect(ctx.notice.value?.tone).toBe('error')
      expect(ctx.drawing.value?.bends).toEqual(diagonal)
      expect(store.content!.wires).toBe(wiresBefore)
      expect(store.canUndo).toBe(false)
      expect(wrapper.find('.hint').exists()).toBe(true)
    })

    it('the panel-wide bend cap refuses the wire, keeps the drawing and records nothing', async () => {
      const crowded: PanelContent = {
        ...base,
        wires: Array.from({ length: 400 }, (_, i) => ({
          id: id(20000 + i),
          colour: 'brown' as const,
          crossSection: '2.5' as const,
          start: cw(id(2)),
          end: cw(id(3)),
          bends: Array.from({ length: 50 }, (_, k) => ({ x: 300, y: 500 + 10 * k })),
        })),
      }
      const { wrapper, ctx, store } = await mountEditor(crowded)
      await start(wrapper)
      const wiresBefore = store.content!.wires
      await poleIn(wrapper) // the single elbow would be bend 20001
      expect(ctx.notice.value?.tone).toBe('error')
      expect(ctx.drawing.value).not.toBeNull()
      expect(store.content!.wires).toBe(wiresBefore)
      expect(store.canUndo).toBe(false)
    })
  })

  describe('editing gestures are inert while drawing', () => {
    it('a double-click on an existing wire inserts no bend and records nothing', async () => {
      const { wrapper, store } = await mountEditor(wired)
      await wrapper.get('[data-testid=wire]').trigger('pointerdown', { button: 0, pointerId: 1 })
      const before = store.content
      await start(wrapper, id(3))
      await wrapper
        .get('[data-testid=wire]')
        .trigger('dblclick', pointer(wrapper, { x: 294, y: 1250 }))
      expect(store.content).toBe(before)
      expect(store.canUndo).toBe(false)
    })

    it('the bend handles of the selected wire are hidden while drawing and return afterwards', async () => {
      const { wrapper, store } = await mountEditor(wired)
      await wrapper.get('[data-testid=wire]').trigger('pointerdown', { button: 0, pointerId: 1 })
      expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(2)
      await start(wrapper, id(3))
      expect(store.selection).toEqual({ kind: 'wire', id: id(30) })
      expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(0)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await nextTick()
      expect(wrapper.findAll('[data-testid=bend]')).toHaveLength(2)
    })

    it('without drawing the same double-click does insert a bend (control)', async () => {
      const { wrapper, store } = await mountEditor(wired)
      await wrapper.get('[data-testid=wire]').trigger('pointerdown', { button: 0, pointerId: 1 })
      await wrapper
        .get('[data-testid=wire]')
        .trigger('dblclick', pointer(wrapper, { x: 294, y: 1250 }))
      expect(store.undoLabel).toBe('Додати злам')
    })
  })

  describe('the drawing never outlives the content it was started on', () => {
    it('a command applied elsewhere (the properties panel) clears it', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      store.apply(updateInputCable(id(1), { voltage: 400 }), 'Змінити')
      await nextTick()
      expect(ctx.drawing.value).toBeNull()
      expect(wrapper.find('.hint').exists()).toBe(false)
    })

    it('an undo of the store (history outside the canvas) clears it', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      store.apply(updateInputCable(id(1), { voltage: 400 }), 'Змінити')
      await start(wrapper)
      store.undo()
      await nextTick()
      expect(ctx.drawing.value).toBeNull()
    })

    it('the Delete key removing the selection clears it', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      store.select({ kind: 'element', id: id(21) })
      await start(wrapper)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      await nextTick()
      expect(store.content?.rails[0]?.elements).toHaveLength(1)
      expect(ctx.drawing.value).toBeNull()
    })

    it('reloadDiscard clears it', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf({ ...base }))
      await store.reloadDiscard()
      await nextTick()
      expect(ctx.drawing.value).toBeNull()
    })

    it('switching to another panel clears it', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf(base, { id: 'p2' }))
      await store.load('p2')
      await nextTick()
      expect(ctx.drawing.value).toBeNull()
    })

    it('the panel turning read-only (same content) clears it', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      vi.spyOn(panelsApi, 'get').mockResolvedValue(
        panelOf(base, { deletedAt: '2026-02-01T00:00:00+00:00' }),
      )
      await store.reloadDiscard()
      await nextTick()
      expect(store.readOnly).toBe(true)
      expect(ctx.drawing.value).toBeNull()
    })

    it('a pointer move or a harmless selection change keeps it (control)', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: 800, y: 900 }))
      store.select({ kind: 'rail', id: id(10) })
      await nextTick()
      expect(ctx.drawing.value).not.toBeNull()
    })
  })

  describe('undo and redo while drawing', () => {
    const undoButton = (w: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      w.get('button[aria-label^="Скасувати"]')
    const redoButton = (w: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      w.get('button[aria-label^="Повторити"]')
    const ctrl = (key: string, extra: KeyboardEventInit = {}) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, ...extra }))

    it('Ctrl+Z and the toolbar button remove the last bend, then cancel; history stays untouched', async () => {
      const { wrapper, ctx, store } = await mountEditor(base, { toolbar: true })
      store.apply(addAuto(31, cw(id(3)), pole(id(21), 0, 'input')), 'Раніше')
      await nextTick() // let the content watcher settle before drawing starts
      const before = store.content
      await start(wrapper)
      await clickAt(wrapper, { x: 300, y: 900 })
      await clickAt(wrapper, { x: 700, y: 900 })
      ctrl('z')
      expect(ctx.drawing.value?.bends).toEqual([{ x: 300, y: 900 }])
      await undoButton(wrapper).trigger('click')
      expect(ctx.drawing.value?.bends).toEqual([])
      expect(ctx.drawing.value).not.toBeNull()
      expect(store.content).toBe(before)
      expect(store.undoLabel).toBe('Раніше')
      expect(store.canRedo).toBe(false)
      ctrl('z') // nothing left to step back: cancel
      expect(ctx.drawing.value).toBeNull()
      expect(store.content).toBe(before)
      expect(store.undoLabel).toBe('Раніше')
      ctrl('z') // not drawing any more: the real undo
      expect(store.content).not.toBe(before)
    })

    it('Ctrl+Z is prevented while drawing', async () => {
      const { wrapper } = await mountEditor(base)
      await start(wrapper)
      const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true })
      window.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(true)
    })

    it('redo (Ctrl+Y, Ctrl+Shift+Z, the toolbar button) is ignored while drawing', async () => {
      const { wrapper, ctx, store } = await mountEditor(base, { toolbar: true })
      store.apply(addAuto(31, cw(id(3)), pole(id(21), 0, 'input')), 'Раніше')
      store.undo()
      await nextTick()
      const before = store.content
      expect(store.canRedo).toBe(true)
      await start(wrapper)
      await clickAt(wrapper, { x: 300, y: 900 })
      ctrl('y')
      ctrl('z', { shiftKey: true })
      await redoButton(wrapper).trigger('click')
      expect(store.content).toBe(before)
      expect(store.canRedo).toBe(true)
      expect(ctx.drawing.value?.bends).toEqual([{ x: 300, y: 900 }])
    })

    it('redo works again once drawing is over (control)', async () => {
      const { wrapper, store } = await mountEditor(base, { toolbar: true })
      store.apply(addAuto(31, cw(id(3)), pole(id(21), 0, 'input')), 'Раніше')
      store.undo()
      await nextTick() // the toolbar button is enabled after the re-render
      await redoButton(wrapper).trigger('click')
      expect(store.content?.wires).toHaveLength(1)
    })
  })

  describe('toolbar undo / redo buttons while drawing', () => {
    const undoBtn = (w: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      w.get('button[aria-label^="Скасувати"]')
    const redoBtn = (w: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      w.get('button[aria-label^="Повторити"]')

    it('without drawing and with an empty history undo is disabled (control)', async () => {
      const { wrapper } = await mountEditor(base, { toolbar: true })
      expect(undoBtn(wrapper).attributes('disabled')).toBeDefined()
      expect(undoBtn(wrapper).attributes('title')).toBe('Немає що скасовувати')
    })

    it('undo is enabled with an empty history and says "cancel the wire" when no bends exist', async () => {
      const { wrapper, store } = await mountEditor(base, { toolbar: true })
      await start(wrapper)
      expect(store.canUndo).toBe(false)
      expect(undoBtn(wrapper).attributes('disabled')).toBeUndefined()
      expect(undoBtn(wrapper).attributes('title')).toBe('Скасувати провід')
    })

    it('with bends the title says "remove the last bend"; redo is disabled even with a redo stack', async () => {
      const { wrapper, store } = await mountEditor(base, { toolbar: true })
      store.apply(addAuto(31, cw(id(3)), pole(id(21), 0, 'input')), 'Раніше')
      store.undo()
      await nextTick()
      expect(store.canRedo).toBe(true)
      expect(redoBtn(wrapper).attributes('disabled')).toBeUndefined()
      await start(wrapper)
      await clickAt(wrapper, { x: 300, y: 900 })
      expect(undoBtn(wrapper).attributes('title')).toBe('Прибрати останній злам')
      expect(redoBtn(wrapper).attributes('disabled')).toBeDefined()
    })

    it('the buttons return to the history state when drawing ends', async () => {
      const { wrapper } = await mountEditor(base, { toolbar: true })
      await start(wrapper)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await nextTick()
      expect(undoBtn(wrapper).attributes('disabled')).toBeDefined()
    })
  })

  describe('contact clicks around finishing a wire', () => {
    const poleIn20 = (wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      wrapper.get(`[data-ep-kind=pole][data-ep-a="${id(20)}"][data-ep-b="0"][data-ep-side=input]`)
    /** A pointerdown with a controlled timeStamp / detail (the real ones are wall-clock). */
    function press(el: Element, init: { timeStamp: number; detail?: number }) {
      const e = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: init.detail ?? 0,
      })
      Object.defineProperty(e, 'timeStamp', { value: init.timeStamp })
      Object.defineProperty(e, 'pointerId', { value: 1 })
      el.dispatchEvent(e)
    }

    it('the second press of a double-click (detail >= 2) on a contact does not start a wire', async () => {
      const { wrapper, ctx } = await mountEditor(base)
      const el = wrapper.get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`).element
      press(el, { timeStamp: 1000, detail: 2 })
      await nextTick()
      expect(ctx.drawing.value).toBeNull()
      press(el, { timeStamp: 5000, detail: 1 }) // control: a single press starts it
      await nextTick()
      expect(ctx.drawing.value).not.toBeNull()
    })

    it('a press on the end contact within 500 ms of finishing is ignored, later ones start a wire', async () => {
      const { wrapper, ctx, store } = await mountEditor(base)
      await start(wrapper)
      press(poleIn20(wrapper).element, { timeStamp: 1000 }) // finishes the wire
      await nextTick()
      expect(store.content?.wires).toHaveLength(1)
      expect(ctx.drawing.value).toBeNull()
      press(poleIn20(wrapper).element, { timeStamp: 1300 }) // 300 ms later: the double-click tail
      await nextTick()
      expect(ctx.drawing.value).toBeNull()
      press(poleIn20(wrapper).element, { timeStamp: 1600 }) // 600 ms later: a real new wire
      await nextTick()
      expect(ctx.drawing.value).not.toBeNull()
    })

    it('another contact right after finishing starts a wire at once', async () => {
      const { wrapper, ctx } = await mountEditor(base)
      await start(wrapper)
      press(poleIn20(wrapper).element, { timeStamp: 1000 })
      await nextTick()
      press(wrapper.get(`[data-ep-kind=cableWire][data-ep-a="${id(3)}"]`).element, {
        timeStamp: 1100,
      })
      await nextTick()
      expect(ctx.drawing.value?.start).toEqual(cw(id(3)))
    })
  })

  describe('toolbar colour while drawing', () => {
    const colourSelect = (w: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      w.get('label select')
    const rubberStroke = (w: Awaited<ReturnType<typeof mountEditor>>['wrapper']) =>
      (w.get('polyline.rubber').element as SVGElement).style.stroke

    it('changing it recolours the drawing and the rubber band, and the finished wire', async () => {
      const { wrapper, ctx, store } = await mountEditor(base, { toolbar: true })
      await start(wrapper)
      expect(ctx.drawing.value?.colour).toBe('brown')
      await wrapper.get('svg').trigger('pointermove', pointer(wrapper, { x: 800, y: 900 }))
      await colourSelect(wrapper).setValue('red')
      expect(ctx.drawing.value?.colour).toBe('red')
      await nextTick()
      expect(rubberStroke(wrapper)).toMatch(/#d32f2f|rgb\(211, 47, 47\)/i)
      await poleIn(wrapper)
      expect(store.content?.wires[0]?.colour).toBe('red')
    })

    it('the start contact default (W3) wins at the start; a later toolbar change still overrides it', async () => {
      const coloured: PanelContent = {
        ...base,
        inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
      }
      const { wrapper, ctx } = await mountEditor(coloured, { toolbar: true })
      await colourSelect(wrapper).setValue('red')
      await start(wrapper, id(3))
      expect(ctx.drawing.value?.colour).toBe('blue')
      await colourSelect(wrapper).setValue('black')
      expect(ctx.drawing.value?.colour).toBe('black')
    })

    it('changing it when nothing is drawn only changes the toolbar default', async () => {
      const { wrapper, ctx } = await mountEditor(base, { toolbar: true })
      await colourSelect(wrapper).setValue('red')
      expect(ctx.drawing.value).toBeNull()
      expect(ctx.wireColour.value).toBe('red')
      await wrapper
        .get(`[data-ep-kind=terminal][data-ep-a="${id(40)}"][data-ep-b="0"]`)
        .trigger('pointerdown', { button: 0, pointerId: 1 }) // a free contact
      expect(ctx.drawing.value?.colour).toBe('red')
    })
  })

  it('a click on a background while not drawing does not create anything', async () => {
    const { wrapper, ctx, store } = await mountEditor(base)
    await clickAt(wrapper, { x: 800, y: 460 })
    expect(ctx.drawing.value).toBeNull()
    expect(store.canUndo).toBe(false)
  })
})
