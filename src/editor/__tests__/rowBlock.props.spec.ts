/** Block properties for a terminal-row block: its row and the "move to the other row" action. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { PanelContent } from '@/domain/panelContent'
import { MAX_ROW_BLOCKS } from '@/domain/limits'
import { block, content, id, inputCable, rail, rowBlock } from '@/domain/__tests__/helpers'
import { mountEditor, stubLayout } from './harness'
import { t } from '@/i18n'

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Top row: id50 [0,2), id51 [6,7); bottom row: id52 [0,1); rail block id40. */
const base: PanelContent = content({
  railWidthModules: 24,
  inputCables: [inputCable(1, [2, 3])],
  terminalRow: [rowBlock(50, 0, 3), rowBlock(51, 6, 2)],
  bottomTerminalRow: [rowBlock(52, 0, 2)],
  rails: [rail(10, 24, 150, [], [block(40, 4, 1, 2)])],
})

async function open(c: PanelContent, blockId: string, panel: object = {}) {
  const m = await mountEditor(c, { properties: true, panel })
  m.store.select({ kind: 'block', id: blockId })
  await nextTick()
  return m
}
const row = (w: { get: (s: string) => { text: () => string } }) =>
  w.get('[data-testid=block-row]').text()

describe('block properties: row block', () => {
  it.each([
    [50, 'Верхній ряд клемників', 'Перенести у нижній ряд'],
    [52, 'Нижній ряд клемників', 'Перенести у верхній ряд'],
  ] as const)('block %i shows its row "%s" and the action "%s"', async (n, rowText, action) => {
    const { wrapper } = await open(base, id(n))
    expect(row(wrapper)).toBe(rowText)
    expect(wrapper.get('[data-testid=move-block-row]').text()).toBe(action)
  })

  it('a rail block has neither the row line nor the move button', async () => {
    const { wrapper } = await open(base, id(40))
    expect(wrapper.find('[data-testid=block-row]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=move-block-row]').exists()).toBe(false)
  })
})

describe('block properties: move to the other row', () => {
  it('top -> bottom keeps a free offset, selects nothing new, records one undoable entry', async () => {
    const { wrapper, store } = await open(base, id(51))
    const before = store.content
    await wrapper.get('[data-testid=move-block-row]').trigger('click')
    expect(store.content?.terminalRow.map((b) => b.id)).toEqual([id(50)])
    expect(store.content?.bottomTerminalRow.map((b) => [b.id, b.offsetModules])).toEqual([
      [id(52), 0],
      [id(51), 6],
    ])
    expect(store.selection).toEqual({ kind: 'block', id: id(51) })
    expect(store.undoLabel && t(store.undoLabel)).toBe('Перенести клемник в інший ряд')
    await nextTick()
    expect(row(wrapper)).toBe('Нижній ряд клемників')
    store.undo()
    expect(store.content).toBe(before)
    expect(store.canUndo).toBe(false)
  })

  it('takes the nearest free offset when the place in the other row is taken', async () => {
    const { wrapper, store } = await open(base, id(50)) // [0,2) wanted; bottom has id52 [0,1)
    await wrapper.get('[data-testid=move-block-row]').trigger('click')
    expect(store.content?.bottomTerminalRow.find((b) => b.id === id(50))?.offsetModules).toBe(1)
  })

  it('bottom -> top works and the button label flips', async () => {
    const { wrapper, store } = await open(base, id(52))
    await wrapper.get('[data-testid=move-block-row]').trigger('click')
    // [0,2) of the top row is taken by id50: the nearest free 1-module offset is 2
    expect(store.content?.terminalRow.map((b) => [b.id, b.offsetModules])).toEqual([
      [id(50), 0],
      [id(52), 2],
      [id(51), 6],
    ])
    expect(store.content?.bottomTerminalRow).toEqual([])
    await nextTick()
    expect(wrapper.get('[data-testid=move-block-row]').text()).toBe('Перенести у нижній ряд')
  })

  it('shows an error and changes nothing when the other row has no room', async () => {
    const full = content({
      railWidthModules: 4,
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(51, 0, 4), rowBlock(52, 2, 4)],
    })
    const { wrapper, store, ctx } = await open(full, id(50))
    await wrapper.get('[data-testid=move-block-row]').trigger('click')
    expect(store.content?.bottomTerminalRow.map((b) => b.id)).toEqual([id(51), id(52)])
    expect(store.canUndo).toBe(false)
    expect(store.content?.terminalRow.map((b) => b.id)).toEqual([id(50)])
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it('shows an error when the other row already holds 60 blocks', async () => {
    const sixty = content({
      railWidthModules: 60,
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: Array.from({ length: MAX_ROW_BLOCKS }, (_, i) => rowBlock(100 + i, i, 1)),
    })
    const { wrapper, store, ctx } = await open(sixty, id(50))
    await wrapper.get('[data-testid=move-block-row]').trigger('click')
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
    expect(ctx.notice.value?.text).toContain('60')
  })

  it('the button is disabled on a read-only panel', async () => {
    const { wrapper, store } = await open(base, id(50), { deletedAt: '2026-02-01T00:00:00+00:00' })
    const button = wrapper.get('[data-testid=move-block-row]')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(store.canUndo).toBe(false)
  })
})

describe('block properties: translucent mode and rowNoRoom', () => {
  it('the move button is disabled in translucent mode and enabled again after it', async () => {
    const { wrapper, store, ctx } = await open(base, id(50))
    ctx.translucent.value = true
    await nextTick()
    const button = wrapper.get('[data-testid=move-block-row]')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(store.canUndo).toBe(false)
    ctx.translucent.value = false
    await nextTick()
    expect(wrapper.get('[data-testid=move-block-row]').attributes('disabled')).toBeUndefined()
  })

  it('shows the rowNoRoom message when the other row has no free place', async () => {
    const full = content({
      railWidthModules: 4,
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(51, 0, 4), rowBlock(52, 2, 4)],
    })
    const { wrapper, store, ctx } = await open(full, id(50))
    await wrapper.get('[data-testid=move-block-row]').trigger('click')
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value).toEqual({ text: 'В іншому ряду немає вільного місця', tone: 'error' })
  })
})
