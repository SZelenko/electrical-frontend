/** Output-cable properties: the load select (command, history, read-only, language). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { applyLocale, i18n } from '@/i18n'
import { content, id, inputCable, outputCable, rail } from '@/domain/__tests__/helpers'
import { choose, selectDisabled, selectsIn, selectValue } from '@/test/vuetifySelect'
import { mountEditor, stubLayout } from './harness'

const base = content({
  inputCables: [inputCable(1, [2, 3])],
  outputCables: [outputCable(4, [5]), { ...outputCable(6, [7]), load: 'lighting' }],
  rails: [rail(10, 24, 150)],
})

type Mounted = Awaited<ReturnType<typeof mountEditor>>
const loadSelect = (m: Mounted) =>
  selectsIn(m.wrapper).find((s) => (s.props() as { label?: string }).label === 'Навантаження')
const titles = (m: Mounted) =>
  ((loadSelect(m)!.props() as unknown as { items: { title: string }[] }).items ?? []).map(
    (i) => i.title,
  )

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  applyLocale('uk')
  i18n.global.locale.value = 'uk'
  document.body.innerHTML = ''
})

async function select(kind: 'inputCable' | 'outputCable', n: number, opts = {}) {
  const m = await mountEditor(base, { properties: true, toolbar: true, ...opts })
  m.store.select({ kind, id: id(n) })
  await nextTick()
  return m
}

describe('output cable load select', () => {
  it('shows the current load and both choices', async () => {
    const m = await select('outputCable', 4)
    expect(selectValue(loadSelect(m)!)).toBe('socket')
    expect(titles(m)).toEqual(['Розетка', 'Освітлення'])
    const other = await select('outputCable', 6)
    expect(selectValue(loadSelect(other)!)).toBe('lighting')
  })

  it('choosing a load is one undoable command that changes only the icon', async () => {
    const m = await select('outputCable', 4)
    await choose(loadSelect(m)!, 'lighting')
    expect(m.store.content?.outputCables[0]?.load).toBe('lighting')
    expect(m.store.dirty).toBe(true)
    expect(
      m.wrapper.findAll('[data-testid=cable-icon]').map((i) => i.attributes('data-icon')),
    ).toEqual(['flash', 'lighting', 'lighting'])
    m.store.undo()
    await nextTick()
    expect(m.store.content?.outputCables[0]?.load).toBe('socket')
    expect(m.store.canUndo).toBe(false)
    expect(selectValue(loadSelect(m)!)).toBe('socket')
  })

  it('choosing the current load adds no history entry', async () => {
    const m = await select('outputCable', 4)
    await choose(loadSelect(m)!, 'socket')
    expect(m.store.canUndo).toBe(false)
    expect(m.store.dirty).toBe(false)
  })

  it('an input cable has no load select', async () => {
    const m = await select('inputCable', 1)
    expect(loadSelect(m)).toBeUndefined()
  })

  it('is disabled for a panel in the trash', async () => {
    const m = await select('outputCable', 4, { panel: { deletedAt: '2026-02-01T00:00:00+00:00' } })
    expect(selectDisabled(loadSelect(m)!)).toBe(true)
  })

  it('re-translates the item titles and the label on a locale switch', async () => {
    const m = await select('outputCable', 4)
    applyLocale('en')
    await nextTick()
    const sel = selectsIn(m.wrapper).find((s) => (s.props() as { label?: string }).label === 'Load')
    expect(sel).toBeDefined()
    const items = (sel!.props() as unknown as { items: { title: string }[] }).items
    expect(items.map((i) => i.title)).toEqual(['Socket', 'Lighting'])
    applyLocale('uk')
    await nextTick()
    expect(titles(m)).toEqual(['Розетка', 'Освітлення'])
  })
})
