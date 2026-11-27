import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fullPanelJson, jsonResponse, ldList, problem, routeFetch } from '@/test/http'
import { PANELS_PAGE_SIZE, pageCount, usePanelsStore } from '../panels'

let store: ReturnType<typeof usePanelsStore>

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  setActivePinia(createPinia())
  store = usePanelsStore()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const p = (id: string, name = id, extra: Record<string, unknown> = {}) =>
  fullPanelJson({ id, name, ...extra })

describe('pageCount', () => {
  it.each([
    [0, 1],
    [1, 1],
    [30, 1],
    [31, 2],
    [60, 2],
    [61, 3],
  ])('%i items -> %i pages', (n, pages) => {
    expect(pageCount(n)).toBe(pages)
  })
  it('uses the server page size by default', () => expect(PANELS_PAGE_SIZE).toBe(30))
})

describe('loadList / loadTrash', () => {
  it('stores items, total and page', async () => {
    routeFetch({ 'GET /panels?page=2': () => ldList([p('a')], 45) })
    await store.loadList(2)
    expect(store.items.map((i) => i.id)).toEqual(['a'])
    expect(store.total).toBe(45)
    expect(store.page).toBe(2)
    expect(store.pages).toBe(2)
  })

  it('keeps previous state when loading fails', async () => {
    routeFetch({ 'GET /panels?page=1': () => jsonResponse(500, {}) })
    await expect(store.loadList(1)).rejects.toMatchObject({ status: 500 })
    expect(store.items).toEqual([])
    expect(store.page).toBe(1)
  })

  it('loads the trash separately', async () => {
    routeFetch({
      'GET /panels/trash?page=1': () =>
        ldList([p('t', 't', { deletedAt: '2026-01-03T00:00:00+00:00' })], 1),
    })
    await store.loadTrash(1)
    expect(store.trashItems).toHaveLength(1)
    expect(store.items).toEqual([])
  })
})

describe('create', () => {
  it('sets the created panel as current', async () => {
    routeFetch({ 'POST /panels': () => jsonResponse(201, p('new', 'New')) })
    const panel = await store.create('New')
    expect(panel.id).toBe('new')
    expect(store.current?.name).toBe('New')
  })

  it('rethrows a name conflict and leaves current untouched', async () => {
    routeFetch({ 'POST /panels': () => problem(409, 'panel_name_conflict') })
    await expect(store.create('Dup')).rejects.toMatchObject({ type: 'panel_name_conflict' })
    expect(store.current).toBeNull()
  })
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('loadPanel', () => {
  it('loads the panel and reports it applied', async () => {
    routeFetch({ 'GET /panels/a': () => jsonResponse(200, p('a')) })
    await expect(store.loadPanel('a')).resolves.toBe(true)
    expect(store.current?.id).toBe('a')
    expect(store.current?.content.inputCables).toHaveLength(1)
  })

  it('clears the previous panel and rethrows on 404', async () => {
    routeFetch({
      'GET /panels/a': () => jsonResponse(200, p('a')),
      'GET /panels/x': () => problem(404, 'not_found'),
    })
    await store.loadPanel('a')
    await expect(store.loadPanel('x')).rejects.toMatchObject({ status: 404 })
    expect(store.current).toBeNull()
  })

  it('rejects an incomplete payload and leaves no current panel', async () => {
    routeFetch({ 'GET /panels/a': () => jsonResponse(200, p('a', 'a', { content: undefined })) })
    await expect(store.loadPanel('a')).rejects.toMatchObject({ name: 'InvalidPayloadError' })
    expect(store.current).toBeNull()
  })

  it('ignores a stale success: the older load resolving late does not overwrite the newer', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    routeFetch({ 'GET /panels/a': () => a.promise, 'GET /panels/b': () => b.promise })
    const loadA = store.loadPanel('a')
    const loadB = store.loadPanel('b')
    b.resolve(jsonResponse(200, p('b')))
    await expect(loadB).resolves.toBe(true)
    a.resolve(jsonResponse(200, p('a')))
    await expect(loadA).resolves.toBe(false)
    expect(store.current?.id).toBe('b')
  })

  it('ignores a stale error: the older load failing late is swallowed', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    routeFetch({ 'GET /panels/a': () => a.promise, 'GET /panels/b': () => b.promise })
    const loadA = store.loadPanel('a')
    const loadB = store.loadPanel('b')
    b.resolve(jsonResponse(200, p('b')))
    await loadB
    a.resolve(problem(500, 'server_error'))
    await expect(loadA).resolves.toBe(false)
    expect(store.current?.id).toBe('b')
  })

  it('still rethrows the error of the latest load', async () => {
    routeFetch({ 'GET /panels/a': () => problem(500, 'server_error') })
    await expect(store.loadPanel('a')).rejects.toMatchObject({ status: 500 })
  })
})

describe('rename', () => {
  it('updates list entries and applies only name/version/updatedAt to current, keeping content', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'Old'), p('b')], 2),
      'GET /panels/trash?page=1': () => ldList([p('a', 'Old')], 1),
      'GET /panels/a': () => jsonResponse(200, p('a', 'Old')),
      'PATCH /panels/a': () =>
        jsonResponse(
          200,
          p('a', 'New', {
            version: 2,
            updatedAt: '2026-03-03T00:00:00+00:00',
            // The rename response must never replace the content held locally.
            content: { inputCables: [], outputCables: [], terminalRow: [], rails: [], wires: [] },
          }),
        ),
    })
    await store.loadList(1)
    await store.loadTrash(1)
    await store.loadPanel('a')
    const contentBefore = store.current!.content
    await store.rename('a', 'New')
    expect(store.items[0]).toMatchObject({
      name: 'New',
      version: 2,
      updatedAt: '2026-03-03T00:00:00+00:00',
    })
    expect(store.items[1]!.name).toBe('b')
    expect(store.trashItems[0]!.name).toBe('New')
    expect(store.current).toMatchObject({
      name: 'New',
      version: 2,
      updatedAt: '2026-03-03T00:00:00+00:00',
    })
    expect(store.current!.content).toEqual(contentBefore)
    expect(store.current!.content.inputCables).toHaveLength(1)
  })

  it('does not touch the lists or current when it fails', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'Old')], 1),
      'GET /panels/a': () => jsonResponse(200, p('a', 'Old')),
      'PATCH /panels/a': () => problem(409, 'panel_name_conflict'),
    })
    await store.loadList(1)
    await store.loadPanel('a')
    await expect(store.rename('a', 'Dup')).rejects.toMatchObject({ type: 'panel_name_conflict' })
    expect(store.items[0]!.name).toBe('Old')
    expect(store.current?.name).toBe('Old')
  })

  it('leaves unrelated current panel alone', async () => {
    routeFetch({
      'GET /panels/z': () => jsonResponse(200, p('z', 'Zed')),
      'PATCH /panels/a': () => jsonResponse(200, p('a', 'New')),
    })
    await store.loadPanel('z')
    await store.rename('a', 'New')
    expect(store.current?.name).toBe('Zed')
  })
})

describe('moveToTrash', () => {
  it('removes the item and clears current locally without reloading', async () => {
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([p('a'), p('b')], 2),
      'GET /panels/a': () => jsonResponse(200, p('a')),
      'DELETE /panels/a': () => new Response(null, { status: 204 }),
    })
    await store.loadList(1)
    await store.loadPanel('a')
    await store.moveToTrash('a')
    expect(store.current).toBeNull()
    expect(store.items.map((i) => i.id)).toEqual(['b'])
    expect(f.count('GET /panels?page=1')).toBe(1)
  })

  it('keeps a different current panel', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a'), p('b')], 2),
      'GET /panels/b': () => jsonResponse(200, p('b')),
      'DELETE /panels/a': () => new Response(null, { status: 204 }),
    })
    await store.loadList(1)
    await store.loadPanel('b')
    await store.moveToTrash('a')
    expect(store.current?.id).toBe('b')
  })

  it('keeps list and current when the server rejects', async () => {
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([p('a')], 1),
      'GET /panels/a': () => jsonResponse(200, p('a')),
      'DELETE /panels/a': () => jsonResponse(500, {}),
    })
    await store.loadList(1)
    await store.loadPanel('a')
    await expect(store.moveToTrash('a')).rejects.toMatchObject({ status: 500 })
    expect(store.current?.id).toBe('a')
    expect(store.items).toHaveLength(1)
    expect(f.count('GET /panels?page=1')).toBe(1)
  })
})

describe('refreshList / refreshTrash', () => {
  it('reloads the current page', async () => {
    const f = routeFetch({ 'GET /panels?page=1': () => ldList([p('a')], 1) })
    await store.loadList(1)
    await store.refreshList()
    expect(f.count('GET /panels?page=1')).toBe(2)
  })

  it('steps back one page when a non-first page became empty after removals', async () => {
    const f = routeFetch({
      'GET /panels?page=2': () => ldList([p('last')], 31),
      'GET /panels?page=1': () => ldList([p('a')], 30),
      'DELETE /panels/last': () => new Response(null, { status: 204 }),
    })
    await store.loadList(2)
    await store.moveToTrash('last')
    expect(f.count('GET /panels?page=1')).toBe(0)
    await store.refreshList()
    expect(f.count('GET /panels?page=1')).toBe(1)
    expect(store.page).toBe(1)
  })

  it('stays on page 1 when it became empty', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a')], 1),
      'DELETE /panels/a': () => new Response(null, { status: 204 }),
    })
    await store.loadList(1)
    await store.moveToTrash('a')
    await store.refreshList()
    expect(store.page).toBe(1)
  })

  it('trash steps back a page when the last trash item of page 2 goes', async () => {
    routeFetch({
      'GET /panels/trash?page=2': () => ldList([p('t')], 31),
      'GET /panels/trash?page=1': () => ldList([p('u')], 30),
      'POST /panels/t/restore': () => jsonResponse(200, p('t')),
    })
    await store.loadTrash(2)
    await store.restore('t')
    await store.refreshTrash()
    expect(store.trashPage).toBe(1)
  })

  it('rethrows a failed reload and keeps the previous state', async () => {
    routeFetch({
      'GET /panels?page=1': vi
        .fn()
        .mockReturnValueOnce(ldList([p('a')], 1))
        .mockReturnValue(jsonResponse(500, {})),
    })
    await store.loadList(1)
    await expect(store.refreshList()).rejects.toMatchObject({ status: 500 })
    expect(store.items).toHaveLength(1)
  })
})

describe('restore / deletePermanently', () => {
  it('restore removes the item locally without reloading', async () => {
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList([p('t'), p('u')], 2),
      'POST /panels/t/restore': () => jsonResponse(200, p('t')),
    })
    await store.loadTrash(1)
    await store.restore('t')
    expect(store.trashItems.map((i) => i.id)).toEqual(['u'])
    expect(f.count('GET /panels/trash?page=1')).toBe(1)
  })

  it('restore rethrows panel_name_conflict and keeps the item', async () => {
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList([p('t')], 1),
      'POST /panels/t/restore': () => problem(409, 'panel_name_conflict'),
    })
    await store.loadTrash(1)
    await expect(store.restore('t')).rejects.toMatchObject({ type: 'panel_name_conflict' })
    expect(f.count('GET /panels/trash?page=1')).toBe(1)
    expect(store.trashItems).toHaveLength(1)
  })

  it('deletePermanently removes the item locally without reloading', async () => {
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList([p('t'), p('u')], 2),
      'DELETE /panels/t/permanent': () => new Response(null, { status: 204 }),
    })
    await store.loadTrash(1)
    await store.deletePermanently('t')
    expect(f.count('DELETE /panels/t/permanent')).toBe(1)
    expect(store.trashItems.map((i) => i.id)).toEqual(['u'])
    expect(f.count('GET /panels/trash?page=1')).toBe(1)
  })

  it('deletePermanently rethrows panel_not_in_trash and keeps the item', async () => {
    routeFetch({
      'GET /panels/trash?page=1': () => ldList([p('t')], 1),
      'DELETE /panels/t/permanent': () => problem(409, 'panel_not_in_trash'),
    })
    await store.loadTrash(1)
    await expect(store.deletePermanently('t')).rejects.toMatchObject({ type: 'panel_not_in_trash' })
    expect(store.trashItems).toHaveLength(1)
  })
})
