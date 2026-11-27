import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { panelsApi, type Panel } from '@/api/panels'
import { ApiError } from '@/api/problem'
import {
  addRail,
  removeElement,
  updateElement,
  updateInputCable,
  updateRail,
  type Command,
} from '@/domain/commands'
import type { PanelContent } from '@/domain/panelContent'
import { buildWorld, id, cw, run, addAuto } from '@/domain/__tests__/helpers'
import { useAuthStore } from '../auth'
import { HISTORY_LIMIT, itemKey, usePanelEditorStore } from '../panelEditor'

const world = buildWorld()

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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const apiError = (init: ConstructorParameters<typeof ApiError>[0]) => new ApiError(init)

let auth: ReturnType<typeof useAuthStore>
let store: ReturnType<typeof usePanelEditorStore>
let get: MockInstance<typeof panelsApi.get>
let save: MockInstance<typeof panelsApi.saveContent>

function login(userId = 'u1') {
  auth.user = { id: userId, email: 'a@b.c', emailVerified: true, twoFactorEnabled: false } as never
  auth.status = 'authenticated'
}

beforeEach(() => {
  vi.restoreAllMocks()
  setActivePinia(createPinia())
  auth = useAuthStore()
  login()
  store = usePanelEditorStore()
  get = vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf(world))
  save = vi
    .spyOn(panelsApi, 'saveContent')
    .mockImplementation(async (_id, version, c) => panelOf(c, { version: version + 1 }))
})

const voltage = (v: number): Command => updateInputCable(id(1), { voltage: v })

describe('load', () => {
  it('adopts the panel: content is the saved snapshot, clean, no history', async () => {
    expect(await store.load('p1')).toBe('loaded')
    expect(store.content).toBe(world)
    expect(store.savedContent).toBe(world)
    expect(store.dirty).toBe(false)
    expect(store.baseVersion).toBe(3)
    expect(store.name).toBe('Щит 1')
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
    expect(store.readOnly).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('is loading while the request is pending', async () => {
    const d = deferred<Panel>()
    get.mockReturnValueOnce(d.promise)
    const pending = store.load('p1')
    expect(store.loading).toBe(true)
    d.resolve(panelOf(world))
    await pending
    expect(store.loading).toBe(false)
  })

  it('reuses the editor state for the same panel and the same user (no GET, edits kept)', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'voltage')
    const edited = store.content
    expect(await store.load('p1')).toBe('reused')
    expect(get).toHaveBeenCalledTimes(1)
    expect(store.content).toBe(edited)
    expect(store.dirty).toBe(true)
    expect(store.canUndo).toBe(true)
  })

  it('a clean editor is NOT reused: the same panel and user does a GET and returns loaded', async () => {
    await store.load('p1')
    const fresh = panelOf(world, { version: 7, name: 'Свіжий' })
    get.mockResolvedValueOnce(fresh)
    expect(await store.load('p1')).toBe('loaded')
    expect(get).toHaveBeenCalledTimes(2)
    expect(store.baseVersion).toBe(7)
    expect(store.name).toBe('Свіжий')
  })

  it('an editor that went back to the saved state by undo is clean and is not reused', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    store.undo()
    expect(await store.load('p1')).toBe('loaded')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('an editor that was just saved is clean and is not reused', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    await store.save()
    expect(await store.load('p1')).toBe('loaded')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('a dirty editor of the same panel and user is reused without a GET', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    get.mockClear()
    expect(await store.load('p1')).toBe('reused')
    expect(get).not.toHaveBeenCalled()
  })

  it('discards the state and loads again for another panel', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'voltage')
    get.mockResolvedValueOnce(panelOf(world, { id: 'p2', name: 'Другий' }))
    expect(await store.load('p2')).toBe('loaded')
    expect(store.panelId).toBe('p2')
    expect(store.content).toBe(world)
    expect(store.dirty).toBe(false)
    expect(store.canUndo).toBe(false)
  })

  it('does not reuse when nobody is logged in (no owner to match)', async () => {
    auth.user = null
    await store.load('p1')
    await store.load('p1')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('does not reuse the state of another user', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'voltage')
    login('u2')
    await nextTick()
    expect(store.content).toBeNull() // cleared by the user switch
    expect(await store.load('p1')).toBe('loaded')
    expect(get).toHaveBeenCalledTimes(2)
    expect(store.dirty).toBe(false)
  })

  it('ignores a response that arrives after the session was replaced (stale)', async () => {
    const first = deferred<Panel>()
    get.mockReturnValueOnce(first.promise)
    const pending = store.load('p1')
    get.mockResolvedValueOnce(panelOf(world, { id: 'p2', name: 'Другий' }))
    await store.load('p2')
    first.resolve(panelOf(world))
    expect(await pending).toBe('stale')
    expect(store.panelId).toBe('p2')
    expect(store.loading).toBe(false)
  })

  it('a failed load leaves an empty, not-loading store and rethrows', async () => {
    get.mockRejectedValueOnce(apiError({ status: 404, type: 'unknown', message: 'x' }))
    await expect(store.load('p1')).rejects.toMatchObject({ status: 404 })
    expect(store.content).toBeNull()
    expect(store.panelId).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('derives the index and the layout from the content', async () => {
    expect(store.index).toBeNull()
    expect(store.layout).toBeNull()
    await store.load('p1')
    expect(store.index?.elements.has(id(20))).toBe(true)
    expect(store.layout?.width).toBe(10900)
  })
})

describe('trashed panels are read-only', () => {
  beforeEach(async () => {
    get.mockResolvedValue(panelOf(world, { deletedAt: '2026-02-01T00:00:00+00:00' }))
    await store.load('p1')
  })

  it('is flagged read-only and refuses commands, undo, redo and save', async () => {
    expect(store.readOnly).toBe(true)
    expect(store.apply(voltage(400), 'v')).toEqual({ ok: false, reason: 'readOnly' })
    expect(store.content).toBe(world)
    expect(store.undo()).toBeNull()
    expect(store.redo()).toBeNull()
    expect(store.canSave).toBe(false)
    expect(await store.save()).toBe('skipped')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('apply / undo / redo', () => {
  beforeEach(async () => {
    await store.load('p1')
  })

  it('records one entry per applied command with its label', () => {
    const out = store.apply(voltage(400), 'Змінити напругу')
    expect(out.ok).toBe(true)
    expect(store.canUndo).toBe(true)
    expect(store.undoLabel).toBe('Змінити напругу')
    expect(store.content).not.toBe(world)
  })

  it('undo and redo swap references exactly and return the label', () => {
    const before = store.content
    store.apply(voltage(400), 'A')
    const after = store.content
    expect(store.undo()).toBe('A')
    expect(store.content).toBe(before)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(true)
    expect(store.redoLabel).toBe('A')
    expect(store.redo()).toBe('A')
    expect(store.content).toBe(after)
    expect(store.canRedo).toBe(false)
  })

  it('undo/redo with nothing to do return null and change nothing', () => {
    expect(store.undo()).toBeNull()
    expect(store.redo()).toBeNull()
    expect(store.content).toBe(world)
  })

  it('a rejected command records nothing and returns the reason', () => {
    const out = store.apply(removeElement(id(99)), 'del')
    expect(out).toEqual({ ok: false, reason: 'notFound', detail: id(99) })
    expect(store.canUndo).toBe(false)
    expect(store.content).toBe(world)
    expect(store.dirty).toBe(false)
  })

  it('a no-op command records nothing', () => {
    const out = store.apply(voltage(230), 'same')
    expect(out.ok).toBe(true)
    expect(store.canUndo).toBe(false)
    expect(store.dirty).toBe(false)
  })

  it('a new command clears the redo stack', () => {
    store.apply(voltage(400), 'A')
    store.undo()
    expect(store.canRedo).toBe(true)
    store.apply(voltage(500), 'B')
    expect(store.canRedo).toBe(false)
    expect(store.redo()).toBeNull()
  })

  it('undo walks back through several entries in order', () => {
    store.apply(voltage(400), 'A')
    store.apply(voltage(500), 'B')
    store.apply(voltage(600), 'C')
    expect([store.undo(), store.undo(), store.undo(), store.undo()]).toEqual(['C', 'B', 'A', null])
    expect(store.content).toBe(world)
    expect([store.redo(), store.redo()]).toEqual(['A', 'B'])
    expect(store.content?.inputCables[0]?.voltage).toBe(500)
  })

  it(`keeps at most ${HISTORY_LIMIT} undo steps, dropping the oldest`, () => {
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) store.apply(voltage(1000 + i), `s${i}`)
    let undone = 0
    while (store.undo() !== null) undone++
    expect(HISTORY_LIMIT).toBe(200)
    expect(undone).toBe(200)
    expect(store.content?.inputCables[0]?.voltage).toBe(1005) // the state after the 5th command
    expect(store.dirty).toBe(true)
    expect(store.undoLabel).toBeNull()
  })

  it('a structural command with a cascade is one entry; undo restores items and wires identically', () => {
    const out = store.apply(removeElement(id(20)), 'Видалити апарат')
    expect(out.ok && out.removedWires).toBe(2)
    expect(store.content?.wires).toHaveLength(2)
    expect(store.undo()).toBe('Видалити апарат')
    expect(store.content).toBe(world) // same reference: ids, order and wires restored exactly
    expect(store.content?.wires.map((w) => w.id)).toEqual([id(30), id(31), id(32), id(33)])
    expect(store.redo()).toBe('Видалити апарат')
    expect(store.content?.wires).toHaveLength(2)
  })

  it('a pole-count cascade is undone in one step', () => {
    store.apply(updateElement(id(20), { poleCount: 1 }), 'Полюси')
    expect(store.content?.wires.some((w) => w.id === id(31))).toBe(false)
    store.undo()
    expect(store.content).toBe(world)
  })

  it('an apply on an empty store is rejected as read-only', () => {
    store.clear()
    expect(store.apply(voltage(400), 'x')).toEqual({ ok: false, reason: 'readOnly' })
  })
})

describe('dirty is identity-based', () => {
  beforeEach(async () => {
    await store.load('p1')
  })

  it('is clean after loading and dirty after a change', () => {
    expect(store.dirty).toBe(false)
    store.apply(voltage(400), 'A')
    expect(store.dirty).toBe(true)
  })

  it('undoing back to the saved state is clean again; redo is dirty again', () => {
    store.apply(voltage(400), 'A')
    store.undo()
    expect(store.dirty).toBe(false)
    store.redo()
    expect(store.dirty).toBe(true)
  })

  it('an edit that restores equal values by hand is still dirty (a new reference)', () => {
    store.apply(voltage(400), 'A')
    store.apply(voltage(230), 'B')
    expect(store.content).toEqual(world)
    expect(store.dirty).toBe(true)
  })

  it('canSave follows dirty', () => {
    expect(store.canSave).toBe(false)
    store.apply(voltage(400), 'A')
    expect(store.canSave).toBe(true)
  })
})

describe('selection', () => {
  beforeEach(async () => {
    await store.load('p1')
  })

  it('is dropped when the selected item is deleted by a command', () => {
    store.select({ kind: 'element', id: id(20) })
    store.apply(removeElement(id(20)), 'del')
    expect(store.selection).toBeNull()
  })

  it('survives commands that keep the item', () => {
    store.select({ kind: 'element', id: id(20) })
    store.apply(voltage(400), 'v')
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
  })

  it('is not restored by undo (the selection is not part of the history)', () => {
    store.select({ kind: 'element', id: id(20) })
    store.apply(removeElement(id(20)), 'del')
    store.undo()
    expect(store.selection).toBeNull()
  })

  it('itemKey builds kind:id', () => {
    expect(itemKey({ kind: 'wire', id: 'x' })).toBe('wire:x')
  })
})

describe('save: success', () => {
  beforeEach(async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
  })

  it('sends the base version and the exact snapshot, then adopts the new version and snapshot', async () => {
    const snapshot = store.content
    expect(await store.save()).toBe('saved')
    expect(save).toHaveBeenCalledWith('p1', 3, snapshot)
    expect(store.baseVersion).toBe(4)
    expect(store.savedContent).toBe(snapshot)
    expect(store.content).toBe(snapshot) // never replaced by the response
    expect(store.dirty).toBe(false)
    expect(store.saving).toBe(false)
    expect(store.saveError).toBeNull()
  })

  it('keeps the undo history after a save', async () => {
    await store.save()
    expect(store.canUndo).toBe(true)
    store.undo()
    expect(store.dirty).toBe(true) // back before the saved snapshot -> differs from savedContent
  })

  it('does not replace local content with a different server response', async () => {
    const snapshot = store.content
    save.mockResolvedValueOnce(panelOf(world, { version: 4 })) // server echoes something else
    await store.save()
    expect(store.content).toBe(snapshot)
    expect(store.savedContent).toBe(snapshot)
  })

  it('edits made while the save is in flight survive and stay dirty', async () => {
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const sentSnapshot = store.content
    const pending = store.save()
    expect(store.saving).toBe(true)
    store.apply(voltage(500), 'B')
    const newer = store.content
    d.resolve(panelOf(sentSnapshot as PanelContent, { version: 4 }))
    expect(await pending).toBe('saved')
    expect(store.content).toBe(newer)
    expect(store.savedContent).toBe(sentSnapshot)
    expect(store.baseVersion).toBe(4)
    expect(store.dirty).toBe(true)
    // the next save sends the newer content with the adopted version
    await store.save()
    expect(save).toHaveBeenLastCalledWith('p1', 4, newer)
  })

  it('undo during the save back to the saved state makes it clean', async () => {
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const sent = store.content as PanelContent
    const pending = store.save()
    store.apply(voltage(500), 'B')
    store.undo() // back to the sent snapshot
    d.resolve(panelOf(sent, { version: 4 }))
    await pending
    expect(store.dirty).toBe(false)
  })

  it('adopts the server name', async () => {
    save.mockResolvedValueOnce(panelOf(world, { version: 4, name: 'Перейменований' }))
    await store.save()
    expect(store.name).toBe('Перейменований')
  })
})

describe('save: single flight and guards', () => {
  beforeEach(async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
  })

  it('only one save at a time: the second call is skipped and the button state says so', async () => {
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const first = store.save()
    expect(store.canSave).toBe(false)
    expect(await store.save()).toBe('skipped')
    expect(save).toHaveBeenCalledTimes(1)
    d.resolve(panelOf(store.content as PanelContent, { version: 4 }))
    expect(await first).toBe('saved')
  })

  it('a clean store does not call the API', async () => {
    await store.save()
    save.mockClear()
    expect(await store.save()).toBe('skipped')
    expect(save).not.toHaveBeenCalled()
  })

  it('an empty store does not call the API', async () => {
    store.clear()
    expect(await store.save()).toBe('skipped')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('save: errors', () => {
  beforeEach(async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
  })

  it('409 panel_version_conflict opens the conflict state with the current version and keeps local work', async () => {
    const local = store.content
    save.mockRejectedValueOnce(
      apiError({
        status: 409,
        type: 'panel_version_conflict',
        message: 'stale',
        currentVersion: 9,
      }),
    )
    expect(await store.save()).toBe('failed')
    expect(store.saveError).toEqual({ kind: 'conflict', currentVersion: 9 })
    expect(store.conflict).toBe(true)
    expect(store.canSave).toBe(false)
    expect(store.dirty).toBe(true)
    expect(store.content).toBe(local)
    expect(store.baseVersion).toBe(3)
    expect(store.saving).toBe(false)
    expect(await store.save()).toBe('skipped') // saving stays disabled until reload
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a conflict without a version number still opens the dialog', async () => {
    save.mockRejectedValueOnce(
      apiError({ status: 409, type: 'panel_version_conflict', message: 'stale' }),
    )
    await store.save()
    expect(store.saveError).toEqual({ kind: 'conflict', currentVersion: null })
  })

  it('409 panel_content_id_conflict is an id error, not the conflict dialog; local state stays savable', async () => {
    save.mockRejectedValueOnce(
      apiError({ status: 409, type: 'panel_content_id_conflict', message: 'ids' }),
    )
    await store.save()
    expect(store.saveError).toEqual({ kind: 'idConflict', message: 'ids' })
    expect(store.conflict).toBe(false)
    expect(store.canSave).toBe(true)
    expect(store.dirty).toBe(true)
  })

  it('404 means the panel was deleted or moved to the trash', async () => {
    save.mockRejectedValueOnce(apiError({ status: 404, type: 'unknown', message: 'nf' }))
    await store.save()
    expect(store.saveError).toEqual({ kind: 'deleted' })
    expect(store.dirty).toBe(true)
  })

  it('401 is an auth failure and is not retried automatically', async () => {
    save.mockRejectedValueOnce(apiError({ status: 401, type: 'token_invalid', message: 'no' }))
    expect(await store.save()).toBe('failed')
    expect(store.saveError).toEqual({ kind: 'auth' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(store.dirty).toBe(true)
    expect(store.canSave).toBe(true) // the user may save again after re-login
  })

  it('a network failure is classified as such', async () => {
    save.mockRejectedValueOnce(apiError({ status: 0, type: 'network', message: 'Network error' }))
    await store.save()
    expect(store.saveError).toEqual({ kind: 'network' })
  })

  it.each([
    [
      'a 500',
      apiError({ status: 500, type: 'unknown', message: 'boom' }),
      { kind: 'unknown', message: 'boom' },
    ],
    ['a plain Error', new Error('oops'), { kind: 'unknown', message: 'oops' }],
    ['a non-error throw', 'weird', { kind: 'unknown', message: 'Unknown error' }],
  ])('%s is an unknown error with its message', async (_n, error, expected) => {
    save.mockRejectedValueOnce(error)
    await store.save()
    expect(store.saveError).toEqual(expected)
  })

  it('clears the previous error when the next save starts and when it succeeds', async () => {
    save.mockRejectedValueOnce(apiError({ status: 0, type: 'network', message: 'n' }))
    await store.save()
    expect(store.saveError).not.toBeNull()
    await store.save()
    expect(store.saveError).toBeNull()
    expect(store.dirty).toBe(false)
  })
})

describe('save: 422 violations (E9)', () => {
  it('resolves paths against the sent payload, selects the first existing item and lists the rest as general', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    save.mockRejectedValueOnce(
      apiError({
        status: 422,
        type: 'validation',
        message: 'invalid',
        violations: {
          'content.rails[0].elements[0].label': ['Must be at most 16 characters long.'],
          'content.wires': ['At most 5000 wires are allowed.'],
          'content.inputCables[0].voltage': ['Must be greater than 0.'],
        },
      }),
    )
    expect(await store.save()).toBe('failed')
    const error = store.saveError
    expect(error?.kind).toBe('validation')
    expect(error?.kind === 'validation' && error.violations.map((v) => v.item)).toEqual([
      { kind: 'element', id: id(20) },
      null,
      { kind: 'inputCable', id: id(1) },
    ])
    expect([...store.violationItems].sort()).toEqual(
      [`element:${id(20)}`, `inputCable:${id(1)}`].sort(),
    )
    expect(store.generalViolations.map((v) => v.propertyPath)).toEqual(['content.wires'])
    expect(store.selection).toEqual({ kind: 'element', id: id(20) })
    expect(store.canSave).toBe(true)
  })

  it('resolves against the SENT payload: an item deleted while saving becomes a general violation', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const pending = store.save()
    store.apply(removeElement(id(20)), 'del') // elements[0] is now E2 in the current content
    d.reject(
      apiError({
        status: 422,
        type: 'validation',
        message: 'invalid',
        violations: { 'content.rails[0].elements[0].label': ['too long'] },
      }),
    )
    await pending
    const error = store.saveError
    expect(error?.kind === 'validation' && error.violations[0]?.item).toEqual({
      kind: 'element',
      id: id(20),
    })
    expect(store.violationItems.size).toBe(0) // E1 no longer exists
    expect(store.generalViolations).toHaveLength(1)
    expect(store.selection).toBeNull()
  })

  it('a violation index that no longer matches after the edit still points at the sent item', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const pending = store.save()
    store.apply(removeElement(id(20)), 'del')
    d.reject(
      apiError({
        status: 422,
        type: 'validation',
        message: 'x',
        violations: { 'content.rails[0].elements[1].label': ['bad'] },
      }),
    )
    await pending
    expect(store.violationItems.has(`element:${id(21)}`)).toBe(true) // E2 still exists under the same id
  })

  it('a 422 without a violations list becomes one general message', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    save.mockRejectedValueOnce(apiError({ status: 422, type: 'unknown', message: 'Unprocessable' }))
    await store.save()
    expect(store.generalViolations).toEqual([
      { propertyPath: '', messages: ['Unprocessable'], item: null },
    ])
  })

  it('violation getters are empty when there is no validation error', async () => {
    await store.load('p1')
    expect(store.violationItems.size).toBe(0)
    expect(store.generalViolations).toEqual([])
  })
})

describe('short circuits: backend vs local', () => {
  const shorted = run(world, addAuto(60, cw(id(2)), cw(id(3)))).content
  const fake = [{ sources: ['a', 'b'], wireIds: ['w'], terminals: [] }]

  it('shows the backend list while the content equals the saved content', async () => {
    get.mockResolvedValue(panelOf(shorted, { shortCircuits: fake }))
    await store.load('p1')
    expect(store.shortCircuits).toBe(fake)
    expect([...store.shortCircuitWires]).toEqual(['w'])
    expect(store.localShortCircuits).toHaveLength(1) // the local check disagrees but is not shown
  })

  it('switches to the local result as soon as the content differs and back on undo', async () => {
    get.mockResolvedValue(panelOf(shorted, { shortCircuits: fake }))
    await store.load('p1')
    store.apply(voltage(400), 'A')
    expect(store.shortCircuits).toBe(store.localShortCircuits)
    expect(store.shortCircuits[0]?.wireIds).toEqual([id(30), id(60)]) // W1 hangs on the shorted cable wire
    store.undo()
    expect(store.shortCircuits).toBe(fake)
  })

  it('a clean panel without a short circuit shows none', async () => {
    await store.load('p1')
    expect(store.shortCircuits).toEqual([])
    expect(store.shortCircuitWires.size).toBe(0)
  })

  it('after a save the backend answer is authoritative until the next edit', async () => {
    await store.load('p1')
    store.apply(addAuto(60, cw(id(2)), cw(id(3))), 'wire')
    expect(store.shortCircuits).toHaveLength(1) // local while dirty
    save.mockImplementationOnce(async (_id, version, c) =>
      panelOf(c, { version: version + 1, shortCircuits: [] }),
    )
    await store.save()
    expect(store.shortCircuits).toEqual([]) // the server says none: its word wins
    store.apply(voltage(400), 'v')
    expect(store.shortCircuits).toHaveLength(1)
  })
})

describe('reloadDiscard', () => {
  it('after a conflict replaces everything with the server state and clears the error and history', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    save.mockRejectedValueOnce(
      apiError({ status: 409, type: 'panel_version_conflict', message: 's', currentVersion: 5 }),
    )
    await store.save()
    const fresh = panelOf(world, { version: 5, name: 'Нове' })
    get.mockResolvedValueOnce(fresh)
    expect(await store.reloadDiscard()).toBe('loaded')
    expect(store.content).toBe(fresh.content)
    expect(store.dirty).toBe(false)
    expect(store.baseVersion).toBe(5)
    expect(store.name).toBe('Нове')
    expect(store.saveError).toBeNull()
    expect(store.conflict).toBe(false)
    expect(store.canUndo).toBe(false)
    expect(store.canSave).toBe(false)
  })

  it('keeps the owner: unsaved edits made after a reload are reused for the same user', async () => {
    await store.load('p1')
    await store.reloadDiscard()
    store.apply(voltage(400), 'A')
    expect(await store.load('p1')).toBe('reused')
  })

  it('a clean editor after a reload does a fresh GET on the next load', async () => {
    await store.load('p1')
    await store.reloadDiscard()
    get.mockClear()
    expect(await store.load('p1')).toBe('loaded')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('does nothing without an open panel', async () => {
    expect(await store.reloadDiscard()).toBe('stale')
    expect(get).not.toHaveBeenCalled()
  })

  it('a failing reload rejects and keeps the local state', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    const local = store.content
    get.mockRejectedValueOnce(apiError({ status: 0, type: 'network', message: 'n' }))
    await expect(store.reloadDiscard()).rejects.toMatchObject({ type: 'network' })
    expect(store.content).toBe(local)
    expect(store.loading).toBe(false)
  })

  it('a reload overtaken by clear() is ignored', async () => {
    await store.load('p1')
    const d = deferred<Panel>()
    get.mockReturnValueOnce(d.promise)
    const pending = store.reloadDiscard()
    store.clear()
    d.resolve(panelOf(world))
    expect(await pending).toBe('stale')
    expect(store.content).toBeNull()
  })
})

describe('late responses after the session ended', () => {
  it('a save that finishes after clear() does not resurrect the state', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const pending = store.save()
    store.clear()
    d.resolve(panelOf(world, { version: 4 }))
    expect(await pending).toBe('stale')
    expect(store.savedContent).toBeNull()
    expect(store.baseVersion).toBe(0)
    expect(store.saving).toBe(false)
  })

  it('a save error after clear() is ignored', async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
    const d = deferred<Panel>()
    save.mockReturnValueOnce(d.promise)
    const pending = store.save()
    store.clear()
    d.reject(
      apiError({ status: 409, type: 'panel_version_conflict', message: 's', currentVersion: 9 }),
    )
    expect(await pending).toBe('stale')
    expect(store.saveError).toBeNull()
  })
})

describe('noteRenamed (E11)', () => {
  beforeEach(async () => {
    await store.load('p1') // base version 3
  })

  it('adopts the version only when it directly follows the base version', () => {
    store.noteRenamed('p1', 'Нова назва', 4)
    expect(store.baseVersion).toBe(4)
    expect(store.name).toBe('Нова назва')
  })

  it.each([
    ['skipped versions (someone saved in between)', 6],
    ['the same version', 3],
    ['an older version', 2],
  ])('keeps the base version for %s but updates the name', (_n, version) => {
    store.noteRenamed('p1', 'Інша', version)
    expect(store.baseVersion).toBe(3)
    expect(store.name).toBe('Інша')
  })

  it('ignores a rename of another panel', () => {
    store.noteRenamed('other', 'X', 4)
    expect(store.baseVersion).toBe(3)
    expect(store.name).toBe('Щит 1')
  })

  it('the next save after a skipped version still sends the old base (the server answers 409)', async () => {
    store.noteRenamed('p1', 'Інша', 6)
    store.apply(voltage(400), 'A')
    await store.save()
    expect(save).toHaveBeenCalledWith('p1', 3, expect.anything())
  })

  it('the next save after an adopted version sends the new base', async () => {
    store.noteRenamed('p1', 'Нова', 4)
    store.apply(voltage(400), 'A')
    await store.save()
    expect(save).toHaveBeenCalledWith('p1', 4, expect.anything())
  })
})

describe('session handling (E7)', () => {
  beforeEach(async () => {
    await store.load('p1')
    store.apply(voltage(400), 'A')
  })

  it('logout (anonymous) clears the editor completely', async () => {
    auth.status = 'anonymous'
    auth.user = null
    await nextTick()
    expect(store.panelId).toBeNull()
    expect(store.content).toBeNull()
    expect(store.savedContent).toBeNull()
    expect(store.dirty).toBe(false)
    expect(store.canUndo).toBe(false)
    expect(store.baseVersion).toBe(0)
    expect(store.saveError).toBeNull()
  })

  it('a different user logging in clears the editor', async () => {
    login('someone-else')
    await nextTick()
    expect(store.content).toBeNull()
    expect(store.panelId).toBeNull()
  })

  it('session loss (reloginNeeded) keeps the editor state, the history and the dirty flag', async () => {
    const local = store.content
    auth.status = 'reloginNeeded'
    await nextTick()
    expect(store.content).toBe(local)
    expect(store.dirty).toBe(true)
    expect(store.canUndo).toBe(true)
  })

  it('after the same user logs in again the state is reused and can be saved', async () => {
    const local = store.content
    auth.status = 'reloginNeeded'
    await nextTick()
    login('u1')
    await nextTick()
    expect(await store.load('p1')).toBe('reused')
    expect(store.content).toBe(local)
    expect(await store.save()).toBe('saved')
  })

  it('a save while the session is lost fails with an auth error and keeps the work', async () => {
    auth.status = 'reloginNeeded'
    save.mockRejectedValueOnce(apiError({ status: 401, type: 'token_invalid', message: 'expired' }))
    expect(await store.save()).toBe('failed')
    expect(store.saveError).toEqual({ kind: 'auth' })
    expect(store.dirty).toBe(true)
  })

  it('an auth save error survives the session loss and is cleared when the user is authenticated again', async () => {
    save.mockRejectedValueOnce(apiError({ status: 401, type: 'token_invalid', message: 'expired' }))
    await store.save()
    auth.status = 'reloginNeeded'
    await nextTick()
    expect(store.saveError).toEqual({ kind: 'auth' })
    auth.status = 'authenticated'
    await nextTick()
    expect(store.saveError).toBeNull()
    expect(store.dirty).toBe(true)
  })

  it('other save errors are not cleared by a re-login', async () => {
    save.mockRejectedValueOnce(apiError({ status: 404, type: 'unknown', message: 'nf' }))
    await store.save()
    auth.status = 'reloginNeeded'
    await nextTick()
    auth.status = 'authenticated'
    await nextTick()
    expect(store.saveError).toEqual({ kind: 'deleted' })
  })

  it('clear() resets the in-flight flags', () => {
    store.clear()
    expect(store.saving).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.selection).toBeNull()
  })
})

describe('commands through the store keep content valid', () => {
  it('adding rails up to the limit then rejecting the next leaves history consistent', async () => {
    await store.load('p1')
    for (let i = 0; i < 6; i++)
      expect(store.apply(addRail({ id: id(100 + i) }), `rail${i}`).ok).toBe(true)
    expect(store.content?.rails).toHaveLength(8)
    const rejected = store.apply(addRail({ id: id(200) }), 'one too many')
    expect(rejected).toMatchObject({ ok: false, reason: 'limit' })
    expect(store.undoLabel).toBe('rail5')
    for (let i = 0; i < 6; i++) store.undo()
    expect(store.content).toBe(world)
  })
})

describe('save validates locally first', () => {
  const invalid = (() => {
    const c = structuredClone(world)
    c.inputCables[0]!.voltage = 0
    c.rails[0]!.elements[0]!.label = 'x'.repeat(17)
    return c
  })()

  beforeEach(async () => {
    get.mockResolvedValue(panelOf(invalid))
    await store.load('p1')
    store.apply(updateRail(id(10), { spacingMm: 160 }), 'spacing')
  })

  it('shows the backend-style violations and does not send the PUT', async () => {
    expect(await store.save()).toBe('failed')
    expect(save).not.toHaveBeenCalled()
    const error = store.saveError
    expect(error?.kind).toBe('validation')
    expect(error?.kind === 'validation' && error.violations.map((v) => v.propertyPath)).toEqual([
      'content.inputCables[0].voltage',
      'content.rails[0].elements[0].label',
    ])
    expect([...store.violationItems].sort()).toEqual(
      [`inputCable:${id(1)}`, `element:${id(20)}`].sort(),
    )
    expect(store.selection).toEqual({ kind: 'inputCable', id: id(1) })
    expect(store.saving).toBe(false)
    expect(store.dirty).toBe(true)
    expect(store.canSave).toBe(true)
  })

  it('violations on collection paths go to the general list', async () => {
    store.clear()
    const noCables = { ...world, inputCables: [], wires: [] }
    get.mockResolvedValue(panelOf(noCables))
    await store.load('p1')
    store.apply(updateRail(id(10), { spacingMm: 160 }), 'spacing')
    await store.save()
    expect(store.generalViolations.map((v) => v.propertyPath)).toEqual(['content.inputCables'])
    expect(save).not.toHaveBeenCalled()
  })

  it('a fixed content saves normally and clears the violations', async () => {
    await store.save()
    store.apply(updateInputCable(id(1), { voltage: 230 }), 'fix voltage')
    store.apply(updateElement(id(20), { label: 'QF' }), 'fix label')
    expect(await store.save()).toBe('saved')
    expect(save).toHaveBeenCalledTimes(1)
    expect(store.saveError).toBeNull()
  })
})
