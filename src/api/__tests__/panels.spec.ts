import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CABLE_WIRE_ENDPOINT,
  POLE_ENDPOINT,
  TERMINAL_ENDPOINT,
  fullPanelJson,
  jsonResponse,
  panelContentJson,
  panelJson,
  problem,
  routeFetch,
} from '@/test/http'
import { InvalidPayloadError, normalizePanel, panelsApi, parseCollection } from '../panels'

beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('parseCollection', () => {
  const item = panelJson()

  it.each([
    ['member + totalItems', { member: [item], totalItems: 40 }, 40],
    ['hydra:member + hydra:totalItems', { 'hydra:member': [item], 'hydra:totalItems': 7 }, 7],
    ['missing total falls back to the member count', { member: [item, item] }, 2],
    ['non-numeric total falls back to the member count', { member: [item], totalItems: '9' }, 1],
    ['bare array', [item, item, item], 3],
  ])('reads %s', (_name, data, total) => {
    const page = parseCollection(data)
    expect(page.totalItems).toBe(total)
    expect(page.items[0]).toMatchObject({ id: 'p1', name: 'Щит 1', deletedAt: null })
  })

  it.each([[null], [undefined], ['x'], [{}], [{ member: 'nope' }]])(
    'returns an empty page for %j',
    (data) => {
      expect(parseCollection(data)).toEqual({ items: [], totalItems: 0 })
    },
  )

  it('keeps an explicit null deletedAt and a string deletedAt', () => {
    expect(parseCollection([{ ...panelJson(), deletedAt: null }]).items[0]!.deletedAt).toBeNull()
    expect(parseCollection([{ ...panelJson(), deletedAt: 'x' }]).items[0]!.deletedAt).toBe('x')
  })

  it('throws InvalidPayloadError when deletedAt is omitted', () => {
    const broken: Record<string, unknown> = { ...panelJson() }
    delete broken.deletedAt
    expect(() => parseCollection([broken])).toThrow(InvalidPayloadError)
  })

  it.each([[null], ['x'], [5], [[]]])('throws InvalidPayloadError for member %j', (member) => {
    expect(() => parseCollection([member])).toThrow(InvalidPayloadError)
  })

  it.each(['id', 'name', 'version', 'createdAt', 'updatedAt'])(
    'throws InvalidPayloadError when a list item lacks %s',
    (field) => {
      const broken: Record<string, unknown> = { ...panelJson() }
      delete broken[field]
      expect(() => parseCollection([broken])).toThrow(InvalidPayloadError)
    },
  )
})

/** Payload mutations in the tests below navigate arbitrary paths, so the payload is loosely typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoosePayload = Record<string, any>

describe('normalizePanel', () => {
  /** Applies `mutate` to a fresh valid payload and returns it. */
  function broken(mutate: (p: LoosePayload) => void) {
    const payload: LoosePayload = fullPanelJson()
    mutate(payload)
    return payload
  }

  it('maps a complete payload one to one', () => {
    const panel = normalizePanel(
      fullPanelJson({
        shortCircuits: [
          {
            sources: ['cw1', 'cw2'],
            wireIds: ['pw1'],
            terminals: [POLE_ENDPOINT, TERMINAL_ENDPOINT, CABLE_WIRE_ENDPOINT],
          },
        ],
      }) as never,
    )
    const expectedContent = panelContentJson()
    // bends are kept in integer tenths of a millimetre in the model (the payload carries mm)
    expectedContent.wires[0]!.bends = [{ x: 100, y: 200 }]
    // the model leaves out the null `contactSide` of pole and cable-wire endpoints
    for (const w of expectedContent.wires) {
      for (const e of [w.start, w.end] as { kind: string; contactSide?: unknown }[]) {
        if (e.contactSide === null) delete e.contactSide
      }
    }
    // a short-circuit terminal has no contact side
    const nodeTerminal = {
      kind: TERMINAL_ENDPOINT.kind,
      terminalBlockId: TERMINAL_ENDPOINT.terminalBlockId,
      terminalIndex: TERMINAL_ENDPOINT.terminalIndex,
    }
    const { kind, elementId, poleIndex, side } = POLE_ENDPOINT
    const nodePole = { kind, elementId, poleIndex, side }
    const nodeCable = {
      kind: CABLE_WIRE_ENDPOINT.kind,
      cableWireId: CABLE_WIRE_ENDPOINT.cableWireId,
    }
    expect(panel).toEqual({
      ...panelJson(),
      content: expectedContent,
      shortCircuits: [
        {
          sources: ['cw1', 'cw2'],
          wireIds: ['pw1'],
          terminals: [nodePole, nodeTerminal, nodeCable],
        },
      ],
    })
  })

  it('keeps a provided deletedAt', () => {
    const panel = normalizePanel(fullPanelJson({ deletedAt: '2026-02-02T00:00:00+00:00' }) as never)
    expect(panel.deletedAt).toBe('2026-02-02T00:00:00+00:00')
  })

  it.each<[string, (p: LoosePayload) => void]>([
    ['content arrays', (p) => (p.content = {})],
    ['shortCircuits', (p) => delete p.shortCircuits],
    ['cable wires', (p) => delete p.content.inputCables[0]!.wires],
    ['element poles', (p) => delete p.content.rails[0]!.elements[0]!.poles],
    ['terminal blocks', (p) => delete p.content.rails[0]!.terminalBlocks],
    ['wire bends', (p) => delete p.content.wires[0]!.bends],
  ])('throws InvalidPayloadError when %s are omitted', (_what, mutate) => {
    expect(() => normalizePanel(broken(mutate) as never)).toThrow(InvalidPayloadError)
  })

  it('accepts null in the unused endpoint fields and drops them', () => {
    const panel = normalizePanel(
      broken((p) => {
        p.content.wires[0]!.start = {
          kind: 'cableWire',
          cableWireId: 'cw',
          elementId: null,
          poleIndex: null,
          side: null,
          terminalBlockId: null,
          terminalIndex: null,
        }
      }) as never,
    )
    expect(panel.content.wires[0]!.start).toEqual({ kind: 'cableWire', cableWireId: 'cw' })
  })

  it('throws InvalidPayloadError when a field required by the endpoint kind is null', () => {
    expect(() =>
      normalizePanel(
        broken((p) => {
          p.content.wires[0]!.start = { kind: 'cableWire', cableWireId: null, elementId: null }
        }) as never,
      ),
    ).toThrow(InvalidPayloadError)
  })

  it.each<[string, (p: LoosePayload) => void]>([
    ['content', (p) => delete p.content],
    ['null content', (p) => (p.content = null)],
    ['panel id', (p) => delete p.id],
    ['panel version', (p) => delete p.version],
    ['panel updatedAt', (p) => delete p.updatedAt],
    ['input cable id', (p) => delete p.content.inputCables[0].id],
    ['input cable voltage', (p) => delete p.content.inputCables[0].voltage],
    ['input cable frequency', (p) => delete p.content.inputCables[0].frequency],
    ['input cable crossSection', (p) => delete p.content.inputCables[0].crossSection],
    ['cable wire id', (p) => delete p.content.inputCables[0].wires[0].id],
    ['cable wire colour', (p) => delete p.content.inputCables[0].wires[0].colour],
    ['output cable description', (p) => delete p.content.outputCables[0].description],
    ['panel railWidthModules', (p) => delete p.content.railWidthModules],
    ['input cable label', (p) => delete p.content.inputCables[0].label],
    ['output cable label', (p) => delete p.content.outputCables[0].label],
    ['rail busbars', (p) => delete p.content.rails[0].busbars],
    ['rail spacingMm', (p) => delete p.content.rails[0].spacingMm],
    ['element label', (p) => delete p.content.rails[0].elements[0].label],
    ['element marking', (p) => delete p.content.rails[0].elements[0].marking],
    ['element on', (p) => delete p.content.rails[0].elements[0].on],
    ['element sidesSwapped', (p) => delete p.content.rails[0].elements[0].sidesSwapped],
    ['element widthModules', (p) => delete p.content.rails[0].elements[0].widthModules],
    ['pole transit', (p) => delete p.content.rails[0].elements[0].poles[0].transit],
    [
      'terminal block terminalCount',
      (p) => delete p.content.rails[0].terminalBlocks[0].terminalCount,
    ],
    ['wire colour', (p) => delete p.content.wires[0].colour],
    ['wire crossSection', (p) => delete p.content.wires[0].crossSection],
    ['bend x', (p) => delete p.content.wires[0].bends[0].x],
    ['bend y', (p) => (p.content.wires[0].bends[0].y = null)],
  ])('throws InvalidPayloadError when %s is missing', (_what, mutate) => {
    expect(() => normalizePanel(broken(mutate) as never)).toThrow(InvalidPayloadError)
  })

  it.each<[string, (p: LoosePayload) => void]>([
    ['wire start', (p) => delete p.content.wires[0].start],
    ['wire end', (p) => delete p.content.wires[0].end],
    ['endpoint kind', (p) => delete p.content.wires[0].end.kind],
    ['unknown endpoint kind', (p) => (p.content.wires[0].end.kind = 'bogus')],
    ['pole endpoint elementId', (p) => delete p.content.wires[0].end.elementId],
    ['pole endpoint poleIndex', (p) => delete p.content.wires[0].end.poleIndex],
    ['pole endpoint side', (p) => delete p.content.wires[0].end.side],
    ['terminal endpoint terminalBlockId', (p) => delete p.content.wires[1].start.terminalBlockId],
    ['terminal endpoint terminalIndex', (p) => delete p.content.wires[1].start.terminalIndex],
    ['cableWire endpoint cableWireId', (p) => delete p.content.wires[0].start.cableWireId],
    [
      'short circuit terminal endpoint field',
      (p) => (p.shortCircuits = [{ sources: [], wireIds: [], terminals: [{ kind: 'pole' }] }]),
    ],
  ])('throws InvalidPayloadError when %s is missing', (_what, mutate) => {
    expect(() => normalizePanel(broken(mutate) as never)).toThrow(InvalidPayloadError)
  })

  it('names the missing field in the error message', () => {
    expect(() => normalizePanel(broken((p) => delete p.content) as never)).toThrow(/content/)
  })
})

describe('panelsApi requests', () => {
  const sent = (f: ReturnType<typeof routeFetch>, i = 0) => {
    const init = f.calls[i]!.init
    return { init, headers: init.headers as Record<string, string> }
  }

  async function withToken<T>(fn: () => Promise<T>, f: ReturnType<typeof routeFetch>) {
    // Obtain an access token through the real store so Bearer is present.
    const { useAuthStore } = await import('@/stores/auth')
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    await auth.login('a@b.c', 'pw')
    f.calls.length = 0
    return fn()
  }

  const base = {
    'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
    'GET /me': () =>
      jsonResponse(200, { id: 'u', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false }),
  }

  it.each([
    ['list', () => panelsApi.list(2), 'GET /panels?page=2'],
    ['trash', () => panelsApi.trash(3), 'GET /panels/trash?page=3'],
  ])('%s: GET with ld+json Accept and Bearer, no credentials', async (_n, call, key) => {
    const f = routeFetch({ ...base, [key]: () => jsonResponse(200, { member: [], totalItems: 0 }) })
    await withToken(call, f)
    const { init, headers } = sent(f)
    expect(f.calls[0]!.key).toBe(key)
    expect(headers.Accept).toBe('application/ld+json')
    expect(headers.Authorization).toBe('Bearer T')
    expect(init.credentials).toBeUndefined()
  })

  it('create: POST /panels with ld+json body', async () => {
    const f = routeFetch({ ...base, 'POST /panels': () => jsonResponse(201, fullPanelJson()) })
    const panel = await withToken(() => panelsApi.create('Щит 1'), f)
    const { init, headers } = sent(f)
    expect(headers.Accept).toBe('application/ld+json')
    expect(headers['Content-Type']).toBe('application/ld+json')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Щит 1' })
    expect(panel.id).toBe('p1')
  })

  it('get: encodes the id in the path', async () => {
    const f = routeFetch({ ...base, 'GET /panels/a%2Fb': () => jsonResponse(200, fullPanelJson()) })
    await withToken(() => panelsApi.get('a/b'), f)
    expect(f.calls[0]!.key).toBe('GET /panels/a%2Fb')
  })

  it('rename: PATCH with merge-patch content type', async () => {
    const f = routeFetch({
      ...base,
      'PATCH /panels/p1': () => jsonResponse(200, fullPanelJson({ name: 'N' })),
    })
    const panel = await withToken(() => panelsApi.rename('p1', 'N'), f)
    const { init, headers } = sent(f)
    expect(headers['Content-Type']).toBe('application/merge-patch+json')
    expect(headers.Accept).toBe('application/ld+json')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'N' })
    expect(panel.name).toBe('N')
  })

  it.each([
    ['remove', () => panelsApi.remove('p1'), 'DELETE /panels/p1'],
    ['removePermanently', () => panelsApi.removePermanently('p1'), 'DELETE /panels/p1/permanent'],
  ])('%s: DELETE on the right path', async (_n, call, key) => {
    const f = routeFetch({ ...base, [key]: () => new Response(null, { status: 204 }) })
    await withToken(call, f)
    expect(f.calls[0]!.key).toBe(key)
    expect(sent(f).headers.Authorization).toBe('Bearer T')
  })

  it('restore: POST /panels/{id}/restore', async () => {
    const f = routeFetch({
      ...base,
      'POST /panels/p1/restore': () => jsonResponse(200, fullPanelJson()),
    })
    await withToken(() => panelsApi.restore('p1'), f)
    expect(f.calls[0]!.key).toBe('POST /panels/p1/restore')
  })

  it.each([
    ['get', () => panelsApi.get('p1'), 'GET /panels/p1'],
    ['create', () => panelsApi.create('Щит 1'), 'POST /panels'],
    ['rename', () => panelsApi.rename('p1', 'N'), 'PATCH /panels/p1'],
    ['restore', () => panelsApi.restore('p1'), 'POST /panels/p1/restore'],
  ])(
    '%s: rejects with InvalidPayloadError when the response has no content',
    async (_n, call, key) => {
      const f = routeFetch({ ...base, [key]: () => jsonResponse(200, panelJson()) })
      await expect(withToken(call, f)).rejects.toBeInstanceOf(InvalidPayloadError)
    },
  )

  it('surfaces a typed conflict error with currentVersion', async () => {
    const f = routeFetch({
      ...base,
      'PATCH /panels/p1': () =>
        jsonResponse(409, { type: 'panel_version_conflict', currentVersion: 5 }),
    })
    await expect(withToken(() => panelsApi.rename('p1', 'N'), f)).rejects.toMatchObject({
      type: 'panel_version_conflict',
      currentVersion: 5,
      status: 409,
    })
  })

  it('surfaces a 404 as an unknown-typed ApiError with status 404', async () => {
    const f = routeFetch({ ...base, 'GET /panels/x': () => problem(404, 'not_found') })
    await expect(withToken(() => panelsApi.get('x'), f)).rejects.toMatchObject({ status: 404 })
  })
})
