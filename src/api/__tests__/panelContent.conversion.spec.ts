import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasAtMostDecimals } from '@/domain/limits'
import { mmToTenths } from '@/domain/geometry'
import { buildWorld, id } from '@/domain/__tests__/helpers'
import type { PanelContent } from '@/domain/panelContent'
import { fullPanelJson, jsonResponse, panelContentJson, problem, routeFetch } from '@/test/http'
import {
  InvalidPayloadError,
  contentToPayload,
  normalizeContent,
  normalizePanel,
  panelsApi,
} from '../panels'

type Payload = ReturnType<typeof contentToPayload>

beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const withBends = (bends: { x: number; y: number }[]): PanelContent => {
  const c = structuredClone(buildWorld())
  c.wires[0]!.bends = bends
  return c
}
const firstBends = (p: Payload) => p.wires?.[0]?.bends

describe('normalizeContent: payload mm -> editor tenths', () => {
  it.each([
    [0, 0],
    [0.1, 1],
    [0.3, 3], // 0.3 * 10 = 3.0000000000000004
    [0.7, 7],
    [12.3, 123],
    [150.3, 1503],
    [1234.5, 12345],
    [99999.9, 999999],
  ])('bend %d mm -> %d u', (mm, u) => {
    const json = panelContentJson()
    json.wires[0]!.bends = [{ x: mm, y: mm }]
    expect(normalizeContent(json as never).wires[0]?.bends).toEqual([{ x: u, y: u }])
  })

  it('converts x and y independently and keeps the order of the bends', () => {
    const json = panelContentJson()
    json.wires[0]!.bends = [
      { x: 1.5, y: 2.5 },
      { x: 30, y: 4.1 },
      { x: 0, y: 99999.9 },
    ]
    expect(normalizeContent(json as never).wires[0]?.bends).toEqual([
      { x: 15, y: 25 },
      { x: 300, y: 41 },
      { x: 0, y: 999999 },
    ])
  })

  it('produces integers for every one-decimal mm value on the grid', () => {
    const json = panelContentJson()
    json.wires[0]!.bends = Array.from({ length: 50 }, (_, i) => ({
      x: (i * 7919 + 3) / 10,
      y: (i * 104729 + 1) / 10,
    }))
    for (const b of normalizeContent(json as never).wires[0]!.bends) {
      expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true)
    }
  })

  it('does not scale anything else (spacing stays in mm)', () => {
    const c = normalizeContent(panelContentJson() as never)
    expect(c.rails[0]?.spacingMm).toBe(150)
    expect(c.inputCables[0]?.voltage).toBe(230)
  })

  it('keeps wires without bends as empty lists', () => {
    expect(normalizeContent(panelContentJson() as never).wires[1]?.bends).toEqual([])
  })

  it.each([
    [
      'bends',
      (j: ReturnType<typeof panelContentJson>) => delete (j.wires[0] as { bends?: unknown }).bends,
    ],
    [
      'bend x',
      (j: ReturnType<typeof panelContentJson>) =>
        delete (j.wires[0]!.bends[0] as { x?: unknown }).x,
    ],
    [
      'bend y (null)',
      (j: ReturnType<typeof panelContentJson>) =>
        ((j.wires[0]!.bends[0] as { y: unknown }).y = null),
    ],
  ])('throws InvalidPayloadError when %s is missing', (_n, mutate) => {
    const json = panelContentJson()
    mutate(json)
    expect(() => normalizeContent(json as never)).toThrow(InvalidPayloadError)
  })
})

describe('contentToPayload: editor tenths -> payload mm', () => {
  it.each([
    [0, 0],
    [1, 0.1],
    [3, 0.3],
    [123, 12.3],
    [1503, 150.3],
    [999999, 99999.9],
  ])('bend %d u -> %d mm', (u, mm) => {
    expect(firstBends(contentToPayload(withBends([{ x: u, y: u }])))).toEqual([{ x: mm, y: mm }])
  })

  it('always sends bends, an empty list included', () => {
    const payload = contentToPayload(withBends([]))
    for (const w of payload.wires ?? []) expect(Array.isArray(w.bends)).toBe(true)
    expect(firstBends(payload)).toEqual([])
    expect(JSON.stringify(payload.wires?.[0])).toContain('"bends":[]')
  })

  it('every serialised coordinate has at most one decimal', () => {
    const bends = Array.from({ length: 50 }, (_, i) => ({
      x: i * 7919 + 3,
      y: (i * 104729 + 1) % 1000000,
    }))
    for (const b of firstBends(contentToPayload(withBends(bends))) ?? []) {
      expect(hasAtMostDecimals(b.x as number, 1) && hasAtMostDecimals(b.y as number, 1)).toBe(true)
    }
  })

  it('serialises endpoints with exactly the fields of their kind', () => {
    const payload = contentToPayload(buildWorld())
    expect(payload.wires?.[0]?.start).toEqual({
      kind: 'cableWire',
      cableWireId: id(2),
      contactSide: null,
    })
    expect(payload.wires?.[0]?.end).toEqual({
      kind: 'pole',
      elementId: id(20),
      poleIndex: 0,
      side: 'input',
      contactSide: null,
    })
    expect(payload.wires?.[2]?.start).toEqual({
      kind: 'terminal',
      terminalBlockId: id(40),
      terminalIndex: 0,
      contactSide: 'left',
    })
  })

  it('sends the full tree in payload order', () => {
    const payload = contentToPayload(buildWorld())
    expect(payload.inputCables?.[0]).toEqual({
      id: id(1),
      label: '',
      voltage: 230,
      frequency: 50,
      crossSection: 4,
      wires: [
        { id: id(2), colour: 'brown' },
        { id: id(3), colour: 'blue' },
      ],
    })
    expect(payload.outputCables?.[0]).toEqual({
      id: id(4),
      label: '',
      description: '',
      load: 'socket',
      wires: [{ id: id(5), colour: 'black' }],
    })
    expect(payload.rails?.map((r) => r.id)).toEqual([id(10), id(11)])
    expect(payload.rails?.[0]?.elements?.map((e) => e.id)).toEqual([id(20), id(21)])
    expect(payload.rails?.[0]?.elements?.[0]?.poles).toEqual([
      { transit: false },
      { transit: false },
    ])
    expect(payload.rails?.[0]?.terminalBlocks?.[0]).toEqual({
      id: id(40),
      offsetModules: 8,
      widthModules: 1,
      terminalCount: 3,
      colour: null,
      label: '',
    })
    expect(payload.wires?.map((w) => w.id)).toEqual([id(30), id(31), id(32), id(33)])
  })

  it('does not alias or mutate the editor content', () => {
    const c = buildWorld()
    const snapshot = structuredClone(c)
    const payload = contentToPayload(c)
    ;(payload.rails?.[0]?.elements?.[0]?.poles as { transit: boolean }[])[0]!.transit = true
    ;(payload.inputCables?.[0]?.wires as { colour: string }[])[0]!.colour = 'red'
    expect(c).toEqual(snapshot)
  })
})

describe('mm <-> tenths round trip', () => {
  it('a content survives editor -> payload -> editor unchanged', () => {
    const c = withBends([
      { x: 123, y: 4567 },
      { x: 0, y: 1 },
      { x: 999999, y: 999998 },
    ])
    expect(normalizeContent(contentToPayload(c) as never)).toEqual(c)
  })

  it('a payload survives payload -> editor -> payload unchanged', () => {
    const json = panelContentJson()
    json.wires[0]!.bends = [
      { x: 12.3, y: 45.6 },
      { x: 0.1, y: 99999.9 },
    ]
    const again = contentToPayload(normalizeContent(json as never))
    expect(again.wires?.[0]?.bends).toEqual(json.wires[0]!.bends)
  })

  it('every grid value 0 .. 999999 u survives the conversion pair', () => {
    const bad: number[] = []
    for (let u = 0; u <= 999999; u += 1) {
      if (mmToTenths(u / 10) !== u) bad.push(u)
    }
    expect(bad).toEqual([])
  })

  it('the whole world with auto routes survives the round trip', () => {
    const c = buildWorld()
    expect(normalizeContent(contentToPayload(c) as never)).toEqual(c)
  })
})

describe('panelsApi.saveContent', () => {
  const content = withBends([{ x: 1503, y: 25 }])

  it('PUTs {version, content} as ld+json with bends in mm and returns the normalised panel', async () => {
    const f = routeFetch({
      'PUT /panels/p1/content': () => jsonResponse(200, fullPanelJson({ version: 8 })),
    })
    const panel = await panelsApi.saveContent('p1', 7, content)
    const call = f.calls[0]!
    const headers = call.init.headers as Record<string, string>
    expect(call.key).toBe('PUT /panels/p1/content')
    expect(headers['Content-Type']).toBe('application/ld+json')
    expect(headers.Accept).toBe('application/ld+json')
    const body = JSON.parse(call.init.body as string) as { version: number; content: Payload }
    expect(body.version).toBe(7)
    expect(body.content.wires?.[0]?.bends).toEqual([{ x: 150.3, y: 2.5 }])
    expect(panel.version).toBe(8)
    expect(panel.content.wires[0]?.bends).toEqual([{ x: 100, y: 200 }]) // fixture {x:10,y:20} mm
  })

  it('encodes the panel id in the path', async () => {
    const f = routeFetch({ 'PUT /panels/a%2Fb/content': () => jsonResponse(200, fullPanelJson()) })
    await panelsApi.saveContent('a/b', 1, content)
    expect(f.calls[0]!.key).toBe('PUT /panels/a%2Fb/content')
  })

  it('rejects with the typed conflict error and its current version', async () => {
    routeFetch({
      'PUT /panels/p1/content': () =>
        jsonResponse(409, {
          type: 'panel_version_conflict',
          title: 'c',
          detail: 'stale',
          currentVersion: 9,
        }),
    })
    await expect(panelsApi.saveContent('p1', 7, content)).rejects.toMatchObject({
      status: 409,
      type: 'panel_version_conflict',
      currentVersion: 9,
    })
  })

  it('rejects with the violations of a 422', async () => {
    routeFetch({
      'PUT /panels/p1/content': () =>
        jsonResponse(422, {
          type: '/validation_errors/x',
          violations: [
            { propertyPath: 'content.rails[0].widthModules', message: 'Must be between 1 and 60.' },
          ],
        }),
    })
    await expect(panelsApi.saveContent('p1', 7, content)).rejects.toMatchObject({
      status: 422,
      violations: { 'content.rails[0].widthModules': ['Must be between 1 and 60.'] },
    })
  })

  it('rejects with a 404 and a 500', async () => {
    routeFetch({ 'PUT /panels/p1/content': () => problem(404, 'not_found') })
    await expect(panelsApi.saveContent('p1', 7, content)).rejects.toMatchObject({ status: 404 })
    routeFetch({ 'PUT /panels/p1/content': () => jsonResponse(500, {}) })
    await expect(panelsApi.saveContent('p1', 7, content)).rejects.toMatchObject({ status: 500 })
  })

  it('throws InvalidPayloadError when the response lacks bends', async () => {
    const broken = fullPanelJson() as unknown as { content: { wires: { bends?: unknown }[] } }
    delete broken.content.wires[0]!.bends
    routeFetch({ 'PUT /panels/p1/content': () => jsonResponse(200, broken) })
    await expect(panelsApi.saveContent('p1', 7, content)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    )
  })
})

describe('normalizePanel carries bends in tenths', () => {
  it('a GET payload with one-decimal mm becomes integer tenths', () => {
    const panel = normalizePanel(fullPanelJson() as never)
    expect(panel.content.wires[0]?.bends).toEqual([{ x: 100, y: 200 }])
  })
})
