import { apiRequest } from './client'
import type { components } from './schema'
import type {
  CableWire,
  Endpoint,
  NodeEndpoint,
  PanelContent,
  PanelElement,
  Rail,
  ShortCircuit,
  TerminalBlock,
  WireColour,
  WireCrossSection,
} from '@/domain/panelContent'
import { mmToTenths, tenthsToMm } from '@/domain/geometry'

type Schemas = components['schemas']

const LD = 'application/ld+json'
const MERGE_PATCH = 'application/merge-patch+json'

/** Every field is guaranteed by the schema; `deletedAt` is `null` for active panels. */
export type PanelListItem = Schemas['Panel.PanelListItem']

export interface Panel extends PanelListItem {
  content: PanelContent
  shortCircuits: ShortCircuit[]
}

export interface PanelPage {
  items: PanelListItem[]
  totalItems: number
}

// Compile-time guard: the domain unions must stay equal to the generated enums.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _colourMatches: Equal<WireColour, NonNullable<Schemas['CableWireDto']['colour']>> = true
const _crossSectionMatches: Equal<
  WireCrossSection,
  NonNullable<Schemas['WireDto']['crossSection']>
> = true
void _colourMatches
void _crossSectionMatches

type PayloadEndpoint = Schemas['EndpointDto']
type PayloadBlock = Schemas['TerminalBlockDto']
type PayloadElement = Schemas['ElementDto']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Thrown when the server omits a field it guarantees; never papered over with a default. */
export class InvalidPayloadError extends Error {
  constructor(what: string) {
    super(`Invalid panel payload: missing ${what}`)
    this.name = 'InvalidPayloadError'
  }
}

/** Runtime payload-integrity check: rejects `undefined` and `null` (unused endpoint fields arrive as `null`). */
function req<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) throw new InvalidPayloadError(what)
  return value
}

/** A field that is always present but may be `null`; `undefined` means the server omitted it. */
function nullable<T>(value: T | null | undefined, what: string): T | null {
  if (value === undefined) throw new InvalidPayloadError(what)
  return value
}

function list<T>(value: T[] | undefined, what: string): T[] {
  if (!Array.isArray(value)) throw new InvalidPayloadError(what)
  return value
}

function normalizeListItem(raw: PanelListItem): PanelListItem {
  if (!isRecord(raw)) throw new InvalidPayloadError('panel list item')
  return {
    id: req(raw.id, 'id'),
    name: req(raw.name, 'name'),
    version: req(raw.version, 'version'),
    createdAt: req(raw.createdAt, 'createdAt'),
    updatedAt: req(raw.updatedAt, 'updatedAt'),
    deletedAt: nullable(raw.deletedAt, 'deletedAt'),
  }
}

function normalizeCableWires(raw: Schemas['CableWireDto'][] | undefined): CableWire[] {
  return list(raw, 'cable wires').map((w) => ({
    id: req(w.id, 'cable wire id'),
    colour: req(w.colour, 'cable wire colour'),
  }))
}

function normalizeEndpoint(raw: PayloadEndpoint | undefined): Endpoint {
  const e = req(raw, 'wire endpoint')
  switch (e.kind) {
    case 'pole':
      return {
        kind: 'pole',
        elementId: req(e.elementId, 'endpoint elementId'),
        poleIndex: req(e.poleIndex, 'endpoint poleIndex'),
        side: req(e.side, 'endpoint side'),
      }
    case 'terminal':
      return {
        kind: 'terminal',
        terminalBlockId: req(e.terminalBlockId, 'endpoint terminalBlockId'),
        terminalIndex: req(e.terminalIndex, 'endpoint terminalIndex'),
        contactSide: req(e.contactSide, 'endpoint contactSide'),
      }
    case 'cableWire':
      return { kind: 'cableWire', cableWireId: req(e.cableWireId, 'endpoint cableWireId') }
    default:
      throw new InvalidPayloadError('endpoint kind')
  }
}

/** A short-circuit terminal: the backend strips the contact side, so none is required. */
function normalizeNodeEndpoint(raw: PayloadEndpoint | undefined): NodeEndpoint {
  const e = req(raw, 'short circuit terminal')
  if (e.kind === 'terminal') {
    return {
      kind: 'terminal',
      terminalBlockId: req(e.terminalBlockId, 'endpoint terminalBlockId'),
      terminalIndex: req(e.terminalIndex, 'endpoint terminalIndex'),
    }
  }
  return normalizeEndpoint(e) as Exclude<Endpoint, { kind: 'terminal' }>
}

function normalizeElement(raw: PayloadElement): PanelElement {
  const base = {
    id: req(raw.id, 'element id'),
    offsetModules: req(raw.offsetModules, 'element offsetModules'),
    widthModules: req(raw.widthModules, 'element widthModules'),
    label: req(raw.label, 'element label'),
    marking: req(raw.marking, 'element marking'),
    sidesSwapped: req(raw.sidesSwapped, 'element sidesSwapped'),
  }
  switch (raw.kind) {
    case 'device':
      return {
        ...base,
        kind: 'device',
        style: req(raw.style, 'element style'),
        on: req(raw.on, 'element on'),
        poles: list(raw.poles ?? undefined, 'element poles').map((p) => ({
          transit: req(p.transit, 'pole transit'),
        })),
        // kept as sent so that `validateContent` can report a device that carries a state
        state: (raw.state ?? null) as null,
      }
    case 'ats':
      return {
        ...base,
        kind: 'ats',
        // kept as sent so that `validateContent` can report an ATS that carries a style
        style: (raw.style ?? null) as null,
        state: req(raw.state, 'element state'),
        // kept as sent so that `validateContent` can report an ATS that carries poles or an on flag
        on: (raw.on ?? null) as null,
        poles: (raw.poles ?? null) as null,
      }
    default:
      throw new InvalidPayloadError('element kind')
  }
}

function normalizeBlock(raw: PayloadBlock): TerminalBlock {
  return {
    id: req(raw.id, 'terminal block id'),
    offsetModules: req(raw.offsetModules, 'terminal block offsetModules'),
    widthModules: req(raw.widthModules, 'terminal block widthModules'),
    terminalCount: req(raw.terminalCount, 'terminal block terminalCount'),
    colour: nullable(raw.colour, 'terminal block colour'),
    label: req(raw.label, 'terminal block label'),
  }
}

function normalizeRail(raw: Schemas['RailDto']): Rail {
  return {
    id: req(raw.id, 'rail id'),
    widthModules: req(raw.widthModules, 'rail widthModules'),
    spacingMm: req(raw.spacingMm, 'rail spacingMm'),
    elements: list(raw.elements, 'rail elements').map(normalizeElement),
    terminalBlocks: list(raw.terminalBlocks, 'rail terminalBlocks').map(normalizeBlock),
  }
}

/** Payload (mm, one decimal) to the editor model (bends in integer tenths of a millimetre). */
export function normalizeContent(content: Schemas['PanelContent']): PanelContent {
  return {
    inputCables: list(content.inputCables, 'inputCables').map((c) => ({
      id: req(c.id, 'input cable id'),
      voltage: req(c.voltage, 'input cable voltage'),
      frequency: req(c.frequency, 'input cable frequency'),
      crossSection: req(c.crossSection, 'input cable crossSection'),
      wires: normalizeCableWires(c.wires),
    })),
    outputCables: list(content.outputCables, 'outputCables').map((c) => ({
      id: req(c.id, 'output cable id'),
      description: req(c.description, 'output cable description'),
      wires: normalizeCableWires(c.wires),
    })),
    terminalRow: list(content.terminalRow, 'terminalRow').map(normalizeBlock),
    rails: list(content.rails, 'rails').map(normalizeRail),
    wires: list(content.wires, 'wires').map((w) => ({
      id: req(w.id, 'wire id'),
      colour: req(w.colour, 'wire colour'),
      crossSection: req(w.crossSection, 'wire crossSection'),
      start: normalizeEndpoint(w.start),
      end: normalizeEndpoint(w.end),
      bends: list(w.bends, 'wire bends').map((b) => ({
        x: mmToTenths(req(b.x, 'bend x')),
        y: mmToTenths(req(b.y, 'bend y')),
      })),
    })),
  }
}

export function normalizePanel(raw: Schemas['Panel']): Panel {
  return {
    ...normalizeListItem(raw),
    content: normalizeContent(req(raw.content, 'content')),
    shortCircuits: list(raw.shortCircuits, 'shortCircuits').map((g) => ({
      sources: list(g.sources, 'short circuit sources'),
      wireIds: list(g.wireIds, 'short circuit wireIds'),
      terminals: list(g.terminals, 'short circuit terminals').map(normalizeNodeEndpoint),
    })),
  }
}

function endpointPayload(e: Endpoint): PayloadEndpoint {
  switch (e.kind) {
    case 'pole':
      return {
        kind: 'pole',
        elementId: e.elementId,
        poleIndex: e.poleIndex,
        side: e.side,
        contactSide: null,
      }
    case 'terminal':
      return {
        kind: 'terminal',
        terminalBlockId: e.terminalBlockId,
        terminalIndex: e.terminalIndex,
        contactSide: e.contactSide,
      }
    case 'cableWire':
      return { kind: 'cableWire', cableWireId: e.cableWireId, contactSide: null }
  }
}

function elementPayload(e: PanelElement): PayloadElement {
  const base = {
    kind: e.kind,
    id: e.id,
    offsetModules: e.offsetModules,
    widthModules: e.widthModules,
    label: e.label,
    marking: e.marking,
    sidesSwapped: e.sidesSwapped,
  }
  return e.kind === 'device'
    ? {
        ...base,
        style: e.style,
        on: e.on,
        poles: e.poles.map((p) => ({ transit: p.transit })),
        state: null,
      }
    : { ...base, style: null, on: null, poles: null, state: e.state }
}

/** Editor model to the PUT payload; bends are always sent (mm, one decimal). */
export function contentToPayload(content: PanelContent): Schemas['PanelContent'] {
  const payload: Schemas['PanelContent'] = {
    inputCables: content.inputCables.map((c) => ({ ...c, wires: c.wires.map((w) => ({ ...w })) })),
    outputCables: content.outputCables.map((c) => ({
      ...c,
      wires: c.wires.map((w) => ({ ...w })),
    })),
    terminalRow: content.terminalRow.map((b) => ({ ...b })),
    rails: content.rails.map((r) => ({
      id: r.id,
      widthModules: r.widthModules,
      spacingMm: r.spacingMm,
      elements: r.elements.map(elementPayload),
      terminalBlocks: r.terminalBlocks.map((b) => ({ ...b })),
    })),
    wires: content.wires.map((w) => ({
      id: w.id,
      colour: w.colour,
      crossSection: w.crossSection,
      start: endpointPayload(w.start),
      end: endpointPayload(w.end),
      bends: w.bends.map((b) => ({ x: tenthsToMm(b.x), y: tenthsToMm(b.y) })),
    })),
  }
  return payload
}

/** Reads a collection; handles both `member`/`hydra:member` and `totalItems`/`hydra:totalItems`, or a plain array. */
export function parseCollection(data: unknown): PanelPage {
  let members: unknown = data
  let total: unknown
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const record: Record<string, unknown> = { ...data }
    members = record.member ?? record['hydra:member']
    total = record.totalItems ?? record['hydra:totalItems']
  }
  const items: PanelListItem[] = Array.isArray(members) ? members.map(normalizeListItem) : []
  return { items, totalItems: typeof total === 'number' ? total : items.length }
}

const enc = encodeURIComponent

export const panelsApi = {
  async list(page: number): Promise<PanelPage> {
    const { data } = await apiRequest<unknown>(`/panels?page=${page}`, { accept: LD })
    return parseCollection(data)
  },

  async trash(page: number): Promise<PanelPage> {
    const { data } = await apiRequest<unknown>(`/panels/trash?page=${page}`, { accept: LD })
    return parseCollection(data)
  },

  async create(name: string): Promise<Panel> {
    const { data } = await apiRequest<Schemas['Panel']>('/panels', {
      method: 'POST',
      body: { name },
      accept: LD,
      contentType: LD,
    })
    return normalizePanel(data)
  },

  async get(id: string): Promise<Panel> {
    const { data } = await apiRequest<Schemas['Panel']>(`/panels/${enc(id)}`, { accept: LD })
    return normalizePanel(data)
  },

  /** Replaces the whole content (PUT); 409 `panel_version_conflict`, 422 violations mirror the payload paths. */
  async saveContent(id: string, version: number, content: PanelContent): Promise<Panel> {
    const body: Schemas['Panel.SavePanelContentInput'] = {
      version,
      content: contentToPayload(content),
    }
    const { data } = await apiRequest<Schemas['Panel']>(`/panels/${enc(id)}/content`, {
      method: 'PUT',
      body,
      accept: LD,
      contentType: LD,
    })
    return normalizePanel(data)
  },

  async rename(id: string, name: string): Promise<Panel> {
    const { data } = await apiRequest<Schemas['Panel']>(`/panels/${enc(id)}`, {
      method: 'PATCH',
      body: { name },
      accept: LD,
      contentType: MERGE_PATCH,
    })
    return normalizePanel(data)
  },

  async remove(id: string): Promise<void> {
    await apiRequest<void>(`/panels/${enc(id)}`, { method: 'DELETE', accept: LD })
  },

  async restore(id: string): Promise<Panel> {
    const { data } = await apiRequest<Schemas['Panel']>(`/panels/${enc(id)}/restore`, {
      method: 'POST',
      accept: LD,
    })
    return normalizePanel(data)
  },

  async removePermanently(id: string): Promise<void> {
    await apiRequest<void>(`/panels/${enc(id)}/permanent`, { method: 'DELETE', accept: LD })
  },
}
