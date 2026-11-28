/** Stage 4 follow-up: keyboard switching, layering of the toggle zones, read-only affordance, unknown style. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { newDevice } from '@/domain/deviceStyles'
import type { PanelContent } from '@/domain/panelContent'
import { addAuto, ats, content, cw, id, inputCable, pole, rail } from '@/domain/__tests__/helpers'
import { deviceShapes, shapeFor } from '../shapes/registry'
import { mountEditor, stubLayout } from './harness'
import { t } from '@/i18n'

const base: PanelContent = content({
  inputCables: [inputCable(1, [2, 3])],
  rails: [rail(10, 24, 150, [newDevice('breaker', id(20), 0), ats(23, 4, 2)])],
})
type Wrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']
const toggle = (w: Wrapper, n: number) => w.get(`[data-testid=toggle][data-id="${id(n)}"]`)
const on = (c: PanelContent | null) => (c!.rails[0]!.elements[0] as { on: boolean }).on

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('toggle zone keyboard', () => {
  it('is focusable (tabindex 0) and a button', async () => {
    const { wrapper } = await mountEditor(base)
    expect(toggle(wrapper, 20).attributes('tabindex')).toBe('0')
    expect(toggle(wrapper, 20).attributes('role')).toBe('button')
  })

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
  ])('%s toggles a device with one history entry', async (_n, key) => {
    const { wrapper, store } = await mountEditor(base)
    await toggle(wrapper, 20).trigger('keydown', { key })
    expect(on(store.content)).toBe(false)
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перемкнути')
    store.undo()
    expect(store.canUndo).toBe(false)
    expect(on(store.content)).toBe(true)
  })

  it('Enter on an ATS cycles its state', async () => {
    const { wrapper, store } = await mountEditor(base)
    const states: string[] = []
    for (let i = 0; i < 3; i++) {
      await toggle(wrapper, 23).trigger('keydown', { key: 'Enter' })
      states.push((store.content!.rails[0]!.elements[1] as { state: string }).state)
    }
    expect(states).toEqual(['off', 'B', 'A'])
  })

  it('other keys do nothing', async () => {
    const { wrapper, store } = await mountEditor(base)
    for (const key of ['a', 'Tab', 'Escape', 'ArrowUp']) {
      await toggle(wrapper, 20).trigger('keydown', { key })
    }
    expect(store.canUndo).toBe(false)
    expect(on(store.content)).toBe(true)
  })

  it('does nothing on a read-only panel', async () => {
    const { wrapper, store } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    const t = wrapper.find(`[data-testid=toggle][data-id="${id(20)}"]`)
    if (t.exists()) await t.trigger('keydown', { key: 'Enter' })
    expect(store.canUndo).toBe(false)
    expect(on(store.content)).toBe(true)
  })

  it('does nothing while a wire is being drawn', async () => {
    const { wrapper, store, ctx } = await mountEditor(base)
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    await toggle(wrapper, 20).trigger('keydown', { key: 'Enter' })
    expect(ctx.drawing.value).not.toBeNull()
    expect(store.canUndo).toBe(false)
    expect(on(store.content)).toBe(true)
  })
})

describe('read-only panel has no toggle affordance', () => {
  it('every zone is disabled for assistive tech and removed from the Tab order', async () => {
    const { wrapper } = await mountEditor(base, {
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    const zones = wrapper.findAll('[data-testid=toggle]')
    expect(zones).toHaveLength(2)
    for (const t of zones) {
      expect(t.attributes('aria-disabled')).toBe('true')
      expect(t.attributes('tabindex')).toBe('-1')
      expect(t.classes()).toContain('read-only')
    }
  })

  it('an editable panel offers them as enabled, focusable buttons (control)', async () => {
    const { wrapper } = await mountEditor(base)
    const zones = wrapper.findAll('[data-testid=toggle][role=button]')
    expect(zones).toHaveLength(2)
    for (const t of zones) {
      expect(t.attributes('aria-disabled')).toBe('false')
      expect(t.attributes('tabindex')).toBe('0')
      expect(t.classes()).not.toContain('read-only')
    }
  })
})

describe('toggle zones sit above the wires', () => {
  it('in document order every toggle zone follows every wire path', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(addAuto(30, cw(id(2)), pole(id(20), 0, 'input')), 'editor.history.addWire')
    store.apply(addAuto(31, cw(id(3)), pole(id(23), 2, 'input')), 'editor.history.addWire')
    await nextTick()
    const wires = wrapper.findAll('[data-testid=wire]')
    expect(wires.length).toBe(2)
    for (const t of wrapper.findAll('[data-testid=toggle]')) {
      for (const w of wires) {
        expect(
          w.element.compareDocumentPosition(t.element) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
      }
    }
  })

  it('a click on a zone crossed by a wire toggles and does not select the wire', async () => {
    const { wrapper, store } = await mountEditor(base)
    store.apply(addAuto(30, cw(id(2)), pole(id(20), 0, 'input')), 'editor.history.addWire')
    await nextTick()
    await toggle(wrapper, 20).trigger('pointerdown', {
      button: 0,
      pointerId: 1,
      clientX: 5,
      clientY: 5,
    })
    await wrapper
      .get('svg.canvas')
      .trigger('pointerup', { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    expect(on(store.content)).toBe(false)
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перемкнути')
  })
})

describe('registry fallback for an unknown style', () => {
  it('shapeFor returns the style component, and the breaker for an unknown style', () => {
    expect(shapeFor('rcd')).toBe(deviceShapes.rcd)
    expect(shapeFor('voltageRelay')).toBe(deviceShapes.voltageRelay)
    expect(shapeFor('fuse' as never)).toBe(deviceShapes.breaker)
  })

  it('renders the element with a default shape instead of failing', async () => {
    const odd = structuredClone(base)
    ;(odd.rails[0]!.elements[0] as { style: string }).style = 'fuse'
    const { wrapper } = await mountEditor(odd)
    expect(wrapper.find(`[data-testid=element][data-id="${id(20)}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-testid=toggle][data-id="${id(20)}"]`).exists()).toBe(true)
  })
})
