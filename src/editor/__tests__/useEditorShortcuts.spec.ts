import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { removeElement, updateInputCable } from '@/domain/commands'
import { content, element, id, inputCable, rail } from '@/domain/__tests__/helpers'
import { mountEditor, stubLayout } from './harness'

const base = content({
  inputCables: [inputCable(1, [2, 3])],
  rails: [rail(10, 24, 150, [element(20, 0, 2, 2)])],
})

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function key(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('Backspace while drawing a wire', () => {
  const drawing = (bends: { x: number; y: number }[]) => ({
    start: { kind: 'cableWire' as const, cableWireId: id(2) },
    bends,
    colour: 'brown' as const,
  })

  it('removes the last bend and prevents the browser default', async () => {
    const { ctx } = await mountEditor(base)
    ctx.drawing.value = drawing([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ])
    expect(key({ key: 'Backspace' }).defaultPrevented).toBe(true)
    expect(ctx.drawing.value?.bends).toEqual([{ x: 1, y: 2 }])
  })

  it('keeps the drawing when no bends are left', async () => {
    const { ctx } = await mountEditor(base)
    ctx.drawing.value = drawing([])
    key({ key: 'Backspace' })
    expect(ctx.drawing.value?.bends).toEqual([])
  })

  it('takes priority over deleting the selected item', async () => {
    const { ctx, store } = await mountEditor(base)
    store.select({ kind: 'element', id: id(20) })
    ctx.drawing.value = drawing([{ x: 1, y: 2 }])
    key({ key: 'Backspace' })
    expect(store.content?.rails[0]?.elements).toHaveLength(1)
    expect(ctx.drawing.value?.bends).toEqual([])
  })

  it('is ignored in a text field', async () => {
    const { ctx } = await mountEditor(base)
    ctx.drawing.value = drawing([{ x: 1, y: 2 }])
    const input = document.createElement('input')
    document.body.append(input)
    expect(key({ key: 'Backspace' }, input).defaultPrevented).toBe(false)
    expect(ctx.drawing.value?.bends).toHaveLength(1)
  })

  it('without drawing it deletes the selected item like Delete', async () => {
    const { store } = await mountEditor(base)
    store.select({ kind: 'element', id: id(20) })
    key({ key: 'Backspace' })
    expect(store.content?.rails[0]?.elements).toHaveLength(0)
  })
})

describe('editor keyboard shortcuts', () => {
  it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo (and prevent the browser default)', async () => {
    const { store } = await mountEditor(base)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'A')
    const edited = store.content
    expect(key({ key: 'z', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(store.content).toBe(store.savedContent)
    expect(key({ key: 'Z', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true)
    expect(store.content).toBe(edited)
    key({ key: 'z', ctrlKey: true })
    expect(store.canRedo).toBe(true)
    key({ key: 'y', ctrlKey: true })
    expect(store.content).toBe(edited)
  })

  it('Cmd (meta) works like Ctrl', async () => {
    const { store } = await mountEditor(base)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'A')
    key({ key: 'z', metaKey: true })
    expect(store.dirty).toBe(false)
    key({ key: 'z', metaKey: true, shiftKey: true })
    expect(store.dirty).toBe(true)
  })

  it('a plain Z without a modifier does nothing', async () => {
    const { store } = await mountEditor(base)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'A')
    key({ key: 'z' })
    expect(store.dirty).toBe(true)
  })

  it('Ctrl+Z with nothing to undo is harmless', async () => {
    const { store } = await mountEditor(base)
    key({ key: 'z', ctrlKey: true })
    expect(store.dirty).toBe(false)
  })

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
  ])('ignores the shortcuts while focus is in a %s', async (_n, make) => {
    const { store } = await mountEditor(base)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'A')
    const field = make()
    document.body.append(field)
    const undo = key({ key: 'z', ctrlKey: true }, field)
    expect(undo.defaultPrevented).toBe(false) // the browser's own text undo stays available
    expect(store.dirty).toBe(true)
    key({ key: 'Delete' }, field)
    expect(store.content?.rails[0]?.elements).toHaveLength(1)
  })

  it('ignores redo in a text field too', async () => {
    const { store } = await mountEditor(base)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'A')
    store.undo()
    const input = document.createElement('input')
    document.body.append(input)
    key({ key: 'y', ctrlKey: true }, input)
    key({ key: 'z', ctrlKey: true, shiftKey: true }, input)
    expect(store.canRedo).toBe(true)
  })

  it('Delete removes the selected item; Backspace too', async () => {
    const { store } = await mountEditor(base)
    store.select({ kind: 'element', id: id(20) })
    key({ key: 'Delete' })
    expect(store.content?.rails[0]?.elements).toHaveLength(0)
    expect(store.undoLabel).toBe('Видалити апарат')
  })

  it('Delete without a selection does nothing', async () => {
    const { store } = await mountEditor(base)
    key({ key: 'Delete' })
    expect(store.dirty).toBe(false)
  })

  it('Delete does nothing on a read-only panel', async () => {
    const { store } = await mountEditor(base, { panel: { deletedAt: '2026-02-01T00:00:00+00:00' } })
    store.select({ kind: 'element', id: id(20) })
    key({ key: 'Delete' })
    expect(store.content?.rails[0]?.elements).toHaveLength(1)
  })

  it('Escape cancels wire drawing, even from a text field', async () => {
    const { ctx } = await mountEditor(base)
    ctx.drawing.value = {
      start: { kind: 'cableWire', cableWireId: id(2) },
      bends: [],
      colour: 'brown',
    }
    const input = document.createElement('input')
    document.body.append(input)
    key({ key: 'Escape' }, input)
    expect(ctx.drawing.value).toBeNull()
  })

  it('undo through the shortcut also cancels a pending wire', async () => {
    const { store, ctx } = await mountEditor(base)
    store.apply(removeElement(id(20)), 'x')
    ctx.drawing.value = {
      start: { kind: 'cableWire', cableWireId: id(2) },
      bends: [],
      colour: 'brown',
    }
    key({ key: 'z', ctrlKey: true })
    expect(ctx.drawing.value).toBeNull()
  })

  it('stops listening after the editor is unmounted', async () => {
    const { store, wrapper } = await mountEditor(base)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'A')
    wrapper.unmount()
    await nextTick()
    key({ key: 'z', ctrlKey: true })
    expect(store.dirty).toBe(true)
  })
})
