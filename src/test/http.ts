import { vi } from 'vitest'

/** Shared helpers for tests that mock `fetch`. */
export function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function problem(status: number, type: string, headers: Record<string, string> = {}) {
  return jsonResponse(status, { type, title: type, detail: `detail ${type}` }, headers)
}

type Handler = () => Response | Promise<Response>

/** Routes mocked fetch calls by "METHOD /path" (path relative to the API base URL). */
export function routeFetch(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit }[] = []
  const mock = vi.fn((url: string, init: RequestInit = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '')
    const key = `${init.method ?? 'GET'} ${path}`
    calls.push({ key, init })
    const handler = routes[key]
    if (!handler) return Promise.reject(new Error(`Unexpected request: ${key}`))
    return Promise.resolve(handler())
  })
  vi.stubGlobal('fetch', mock)
  return { mock, calls, count: (key: string) => calls.filter((c) => c.key === key).length }
}

export const ME = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false }

export function panelJson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Щит 1',
    version: 1,
    createdAt: '2026-01-01T10:00:00+00:00',
    updatedAt: '2026-01-02T10:00:00+00:00',
    deletedAt: null,
    ...overrides,
  }
}

/** Wire endpoints used by the full panel payload (cable wire -> pole input, terminal -> output cable wire). */
export const POLE_ENDPOINT = {
  kind: 'pole',
  elementId: 'e1',
  poleIndex: 0,
  side: 'input',
  contactSide: null,
} as const
export const TERMINAL_ENDPOINT = {
  kind: 'terminal',
  terminalBlockId: 'tb1',
  terminalIndex: 1,
  contactSide: 'left',
} as const
export const CABLE_WIRE_ENDPOINT = {
  kind: 'cableWire',
  cableWireId: 'cw1',
  contactSide: null,
} as const

/** Complete, valid panel content as the API guarantees it. Returns a fresh object on each call. */
export function panelContentJson() {
  return {
    inputCables: [
      {
        id: 'c1',
        voltage: 230,
        frequency: 50,
        crossSection: 4,
        wires: [
          { id: 'cw1', colour: 'brown' },
          { id: 'cw2', colour: 'blue' },
        ],
      },
    ],
    outputCables: [{ id: 'o1', description: 'Розетки', wires: [{ id: 'ow1', colour: 'black' }] }],
    terminalRow: [],
    rails: [
      {
        id: 'r1',
        widthModules: 24,
        spacingMm: 150,
        elements: [
          {
            kind: 'device',
            style: 'breaker',
            id: 'e1',
            offsetModules: 0,
            widthModules: 2,
            label: 'Автомат',
            marking: 'QF1',
            on: true,
            sidesSwapped: false,
            poles: [{ transit: false }, { transit: true }],
            state: null,
          },
        ],
        terminalBlocks: [
          {
            id: 'tb1',
            offsetModules: 4,
            widthModules: 1,
            terminalCount: 4,
            colour: null,
            label: '',
          },
        ],
      },
    ],
    wires: [
      {
        id: 'pw1',
        colour: 'brown',
        crossSection: '2.5',
        start: { ...CABLE_WIRE_ENDPOINT },
        end: { ...POLE_ENDPOINT },
        bends: [{ x: 10, y: 20 }],
      },
      {
        id: 'pw2',
        colour: 'blue',
        crossSection: '1.5',
        start: { ...TERMINAL_ENDPOINT },
        end: { kind: 'cableWire', cableWireId: 'ow1', contactSide: null },
        bends: [],
      },
    ],
  }
}

/** Complete, valid single-panel payload (list fields + content + short circuits). */
export function fullPanelJson(overrides: Record<string, unknown> = {}) {
  return panelJson({ content: panelContentJson(), shortCircuits: [], ...overrides })
}

/** JSON-LD collection response. */
export function ldList(items: unknown[], totalItems = items.length) {
  return jsonResponse(200, { '@type': 'Collection', member: items, totalItems })
}
