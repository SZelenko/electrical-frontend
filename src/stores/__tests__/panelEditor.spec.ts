import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { addRail } from '@/domain/commands'
import { panelsApi } from '@/api/panels'
import { normalizePanel } from '@/api/panels'
import { fullPanelJson } from '@/test/http'
import { usePanelEditorStore } from '../panelEditor'

describe('panelEditor store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('undoes and redoes by reference and tracks dirty', async () => {
    vi.spyOn(panelsApi, 'get').mockResolvedValue(normalizePanel(fullPanelJson() as never))
    const store = usePanelEditorStore()
    await store.load('p1')
    const saved = store.content
    expect(store.dirty).toBe(false)
    const outcome = store.apply(
      addRail({ id: '00000000-0000-4000-8000-0000000000aa' }),
      'editor.history.addRail',
    )
    expect(outcome.ok).toBe(true)
    expect(store.dirty).toBe(true)
    store.undo()
    expect(store.content).toBe(saved)
    expect(store.dirty).toBe(false)
    store.redo()
    expect(store.content).not.toBe(saved)
  })
})
