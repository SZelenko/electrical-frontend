/** Shared helpers for the editor e2e specs: a stateful mock of the panel API (page.route) and content builders. */
import type { Page, Request } from '@playwright/test'

export const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

export interface E2eElement {
  kind: 'device'
  style: 'breaker' | 'rcd' | 'voltageRelay'
  state: null
  id: string
  offsetModules: number
  widthModules: number
  label: string
  marking: string
  on: boolean
  sidesSwapped: boolean
  poles: { transit: boolean }[]
}

export const element = (
  n: number,
  offsetModules: number,
  widthModules = 2,
  poles = 2,
  over: Partial<E2eElement> = {},
): E2eElement => ({
  kind: 'device',
  style: 'breaker',
  state: null,
  id: id(n),
  offsetModules,
  widthModules,
  label: '',
  marking: '',
  on: true,
  sidesSwapped: false,
  poles: Array.from({ length: poles }, () => ({ transit: false })),
  ...over,
})

/** A rail terminal block (1 module wide, 1..12 contacts). */
export const block = (n: number, offsetModules: number, widthModules = 1, terminalCount = 2) => ({
  id: id(n),
  offsetModules,
  widthModules,
  terminalCount,
  colour: null,
  label: '',
})

/** A terminal-row block; the width is `ceil(terminalCount / 2)`. */
export const rowBlock = (n: number, offsetModules: number, terminalCount = 2) => ({
  ...block(n, offsetModules, Math.ceil(terminalCount / 2), terminalCount),
})

export interface E2eBusbar {
  id: string
  type: 'L' | 'LN'
  colour: string | null
  firstElementId: string
  count: number
}

export const busbar = (
  n: number,
  type: 'L' | 'LN',
  firstElementId: string,
  count: number,
): E2eBusbar => ({ id: id(n), type, colour: null, firstElementId, count })

/** The rail width is a panel value (`railWidthModules`, default 20 in these specs). */
export const rail = (
  n: number,
  elements: E2eElement[] = [],
  terminalBlocks: ReturnType<typeof block>[] = [],
  spacingMm = 150,
  busbars: E2eBusbar[] = [],
) => ({ id: id(n), spacingMm, elements, terminalBlocks, busbars })

type Json = Record<string, unknown>

export function panelContent(over: Json = {}): Json {
  return {
    railWidthModules: 20,
    inputCableSide: 'top',
    outputCableSide: 'bottom',
    inputCables: [
      {
        id: id(1),
        label: '',
        voltage: 230,
        frequency: 50,
        crossSection: 4,
        wires: [
          { id: id(2), colour: 'brown' },
          { id: id(3), colour: 'blue' },
        ],
      },
    ],
    outputCables: [],
    terminalRow: [],
    bottomTerminalRow: [],
    rails: [rail(10)],
    wires: [],
    ...over,
  }
}

export const feedEnd = (busbarId: string, feedIndex: number) => ({
  kind: 'busbar',
  busbarId,
  feedIndex,
  contactSide: null,
})
export const poleEnd = (elementId: string, poleIndex: number, side: 'input' | 'output') => ({
  kind: 'pole',
  elementId,
  poleIndex,
  side,
  contactSide: null,
})
export const cableEnd = (wireId: string) => ({
  kind: 'cableWire',
  cableWireId: wireId,
  contactSide: null,
})
export const terminalEnd = (
  blockId: string,
  terminalIndex: number,
  contactSide: 'top' | 'bottom' | 'left' | 'right' = 'left',
) => ({
  kind: 'terminal',
  terminalBlockId: blockId,
  terminalIndex,
  contactSide,
})

export function wire(n: number, start: Json, end: Json, bends: { x: number; y: number }[] = []) {
  return { id: id(n), colour: 'brown', crossSection: '2.5', start, end, bends }
}

export interface Server {
  name: string
  version: number
  content: Json
  deletedAt: string | null
  shortCircuits: unknown[]
  /** PUT /panels/p1/content handler; default: accept and echo. */
  put?: (body: { version: number; content: Json }) => {
    status: number
    body: unknown
  }
  puts: { version: number; content: Json }[]
  gets: number
}

export function server(content: Json, over: Partial<Server> = {}): Server {
  return {
    name: 'Щит',
    version: 1,
    content,
    deletedAt: null,
    shortCircuits: [],
    puts: [],
    gets: 0,
    ...over,
  }
}

const panelJson = (s: Server) => ({
  id: 'p1',
  name: s.name,
  version: s.version,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
  deletedAt: s.deletedAt,
  content: s.content,
  shortCircuits: s.shortCircuits,
})

export async function mockApi(page: Page, s: Server) {
  await page.route('**/api/v1/**', async (route) => {
    const req: Request = route.request()
    const path = new URL(req.url()).pathname.replace('/api/v1', '')
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/auth/refresh') return json(200, { token: 't' })
    if (path === '/me')
      return json(200, { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false })
    if (path === '/panels' && req.method() === 'GET')
      return json(200, { member: [], totalItems: 0 })
    if (path === '/panels/p1' && req.method() === 'GET') {
      s.gets += 1
      return json(200, panelJson(s))
    }
    if (path === '/panels/p1/content' && req.method() === 'PUT') {
      const body = req.postDataJSON() as { version: number; content: Json }
      s.puts.push(body)
      if (s.put) {
        const answer = s.put(body)
        return json(answer.status, answer.body)
      }
      s.version = body.version + 1
      s.content = body.content
      return json(200, panelJson(s))
    }
    return json(404, { type: 'not_found' })
  })
}

/** Dispatches the pointerdown the editor listens to on a terminal hit area (works under the svg scale). */
export const press = (locator: import('@playwright/test').Locator) =>
  locator.dispatchEvent('pointerdown', { button: 0 })
