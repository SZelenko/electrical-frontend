/** Layout conversion on every load into the editor (panel-domain "Layout conversion on open"). */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { panelsApi, type Panel } from '@/api/panels'
import { ApiError } from '@/api/problem'
import { updateInputCable } from '@/domain/commands'
import { computeLayoutV1 } from '@/domain/geometryV1'
import type { Pt } from '@/domain/geometry'
import type { PanelContent } from '@/domain/panelContent'
import { autoRouteFor } from '@/domain/routes'
import {
  content,
  cw,
  element,
  id,
  inputCable,
  panelWire,
  pole,
  rail,
} from '@/domain/__tests__/helpers'
import { useAuthStore } from '../auth'
import { usePanelEditorStore } from '../panelEditor'

/** A v1 panel with one wire from the input cable to an element, routed the v1 way. */
function v1Panel(withWire = true): PanelContent {
  const base = content({
    layoutVersion: 1,
    inputCables: [inputCable(1, [2, 3])],
    rails: [rail(10, 24, 150, [element(20, 0, 2, 2)])],
  })
  if (!withWire) return base
  const start = cw(id(2))
  const end = pole(id(20), 0, 'input')
  const bends = autoRouteFor(computeLayoutV1(base), { start, end }) as Pt[]
  return { ...base, wires: [panelWire(30, start, end, bends)] }
}

const v2Panel = (): PanelContent => ({ ...v1Panel(false), layoutVersion: 2 })

function panelOf(c: PanelContent, over: Partial<Panel> = {}): Panel {
  return {
    id: 'p1',
    name: 'Щит 1',
    version: 3,
    createdAt: '2026-01-01T10:00:00+00:00',
    updatedAt: '2026-01-02T10:00:00+00:00',
    deletedAt: null,
    content: c,
    shortCircuits: [],
    ...over,
  }
}

let store: ReturnType<typeof usePanelEditorStore>
let get: MockInstance<typeof panelsApi.get>
let save: MockInstance<typeof panelsApi.saveContent>

beforeEach(() => {
  vi.restoreAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false } as never
  auth.status = 'authenticated'
  store = usePanelEditorStore()
  get = vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf(v1Panel()))
  save = vi
    .spyOn(panelsApi, 'saveContent')
    .mockImplementation(async (_id, version, c) => panelOf(c, { version: version + 1 }))
})

describe('a v1 panel with a re-routed wire', () => {
  it('opens converted and dirty against the server state, with the number of wires', async () => {
    const original = v1Panel()
    get.mockResolvedValue(panelOf(original))
    expect(await store.load('p1')).toBe('loaded')
    expect(store.content?.layoutVersion).toBe(2)
    expect(store.savedContent).toBe(original) // dirty = content !== savedContent
    expect(store.dirty).toBe(true)
    expect(store.convertedWires).toBe(1)
    expect(store.canSave).toBe(true)
    expect(store.content?.wires[0]?.bends).not.toEqual(original.wires[0]?.bends)
  })

  it('has an empty history: undo does not revert the conversion', async () => {
    await store.load('p1')
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
    const converted = store.content
    expect(store.undo()).toBeNull()
    expect(store.content).toBe(converted)
    expect(store.content?.layoutVersion).toBe(2)
  })

  it('an edit after the conversion is undone back to the converted (still dirty) state', async () => {
    await store.load('p1')
    const converted = store.content
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    store.undo()
    expect(store.content).toBe(converted)
    expect(store.dirty).toBe(true)
  })

  it('save sends layoutVersion 2, clears the notice and the dirty state', async () => {
    await store.load('p1')
    expect(await store.save()).toBe('saved')
    expect(save.mock.calls[0]?.[2].layoutVersion).toBe(2)
    expect(store.convertedWires).toBe(0)
    expect(store.dirty).toBe(false)
  })

  it('a failed save keeps the notice', async () => {
    await store.load('p1')
    save.mockRejectedValueOnce(
      new ApiError({ status: 500, type: 'about:blank', message: 'boom' } as never),
    )
    await store.save()
    expect(store.convertedWires).toBe(1)
    expect(store.dirty).toBe(true)
  })

  it('clear() resets the notice', async () => {
    await store.load('p1')
    store.clear()
    expect(store.convertedWires).toBe(0)
  })
})

describe('a v1 panel where nothing changes', () => {
  it('is not dirty; the loaded baseline already carries layoutVersion 2', async () => {
    get.mockResolvedValue(panelOf(v1Panel(false)))
    await store.load('p1')
    expect(store.content?.layoutVersion).toBe(2)
    expect(store.savedContent).toBe(store.content)
    expect(store.savedContent?.layoutVersion).toBe(2)
    expect(store.dirty).toBe(false)
    expect(store.convertedWires).toBe(0)
    expect(store.canSave).toBe(false)
  })

  it('the next save persists layoutVersion 2', async () => {
    get.mockResolvedValue(panelOf(v1Panel(false)))
    await store.load('p1')
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    await store.save()
    expect(save.mock.calls[0]?.[2].layoutVersion).toBe(2)
  })
})

describe('a v2 panel', () => {
  it('is loaded as it is', async () => {
    const c = v2Panel()
    get.mockResolvedValue(panelOf(c))
    await store.load('p1')
    expect(store.content).toBe(c)
    expect(store.dirty).toBe(false)
    expect(store.convertedWires).toBe(0)
  })
})

describe('a trashed v1 panel', () => {
  it('is converted for display only: not dirty, no notice, still read-only', async () => {
    const original = v1Panel()
    get.mockResolvedValue(panelOf(original, { deletedAt: '2026-02-01T00:00:00+00:00' }))
    await store.load('p1')
    expect(store.readOnly).toBe(true)
    expect(store.content?.layoutVersion).toBe(2)
    expect(store.content?.wires[0]?.bends).not.toEqual(original.wires[0]?.bends)
    expect(store.dirty).toBe(false)
    expect(store.convertedWires).toBe(0)
    expect(store.canSave).toBe(false)
    expect(await store.save()).toBe('skipped')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('every load path converts', () => {
  it('reload after a 409 conversion runs on the server state', async () => {
    get.mockResolvedValueOnce(panelOf(v2Panel()))
    await store.load('p1')
    expect(store.convertedWires).toBe(0)
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    save.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        type: 'panel_version_conflict',
        message: 's',
        currentVersion: 5,
      }),
    )
    await store.save()
    expect(store.conflict).toBe(true)
    // somebody else's v1 state arrives on reload
    get.mockResolvedValueOnce(panelOf(v1Panel(), { version: 5 }))
    expect(await store.reloadDiscard()).toBe('loaded')
    expect(store.content?.layoutVersion).toBe(2)
    expect(store.dirty).toBe(true)
    expect(store.convertedWires).toBe(1)
    expect(store.conflict).toBe(false)
    expect(store.canUndo).toBe(false)
  })

  it('opening after a restore from the trash converts and marks dirty', async () => {
    get.mockResolvedValueOnce(panelOf(v1Panel(), { deletedAt: '2026-02-01T00:00:00+00:00' }))
    await store.load('p1')
    expect(store.dirty).toBe(false)
    // restored: the same panel is fetched again without deletedAt
    get.mockResolvedValueOnce(panelOf(v1Panel(), { version: 4 }))
    await store.load('p1')
    expect(store.readOnly).toBe(false)
    expect(store.dirty).toBe(true)
    expect(store.convertedWires).toBe(1)
  })

  it('re-entering the dirty converted panel reuses the session and keeps the notice', async () => {
    await store.load('p1')
    expect(await store.load('p1')).toBe('reused')
    expect(get).toHaveBeenCalledTimes(1)
    expect(store.convertedWires).toBe(1)
  })
})
