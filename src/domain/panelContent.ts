/**
 * View/editor model of a panel, normalised from the API (validated at runtime; no defaults are applied).
 * Bend coordinates are integer tenths of a millimetre (the API carries mm with one decimal; the API layer
 * converts both ways). Elements and terminal blocks of a rail are ordered by offset.
 */
import type { Translate } from './translate'

export type WireColour = 'black' | 'brown' | 'red' | 'blue' | 'green-yellow'

export interface CableWire {
  id: string
  colour: WireColour
}

export interface InputCable {
  id: string
  /** The user's free mark (at most 16 characters, may be empty); not the voltage/frequency/cross-section rating. */
  label: string
  voltage: number
  frequency: number
  crossSection: number
  wires: CableWire[]
}

export interface OutputCable {
  id: string
  /** The user's free mark (at most 16 characters, may be empty). */
  label: string
  description: string
  wires: CableWire[]
}

interface ElementBase {
  id: string
  offsetModules: number
  widthModules: number
  label: string
  marking: string
  sidesSwapped: boolean
}

/** Look and creation defaults of a device; no effect on the short-circuit check. */
export type DeviceStyle = 'breaker' | 'rcd' | 'voltageRelay'

/** An ordinary device: on/off state and poles (the unused ATS fields are `null`, as in the payload). */
export interface DeviceElement extends ElementBase {
  kind: 'device'
  style: DeviceStyle
  on: boolean
  poles: { transit: boolean }[]
  state: null
}

export type AtsState = 'A' | 'B' | 'off'

/** An automatic transfer switch: 4 inputs, 2 outputs, a source state; no poles, no on/off. */
export interface AtsElement extends ElementBase {
  kind: 'ats'
  style: null
  state: AtsState
  on: null
  poles: null
}

export type PanelElement = DeviceElement | AtsElement

/**
 * A terminal block: a bar of joined contacts. On a rail it is 1 module wide with 1..12 contacts in a
 * column; in a terminal row its width is `ceil(contacts / 2)` modules.
 */
export interface TerminalBlock {
  id: string
  offsetModules: number
  widthModules: number
  terminalCount: number
  /** `null` = grey. */
  colour: WireColour | null
  label: string
}

/**
 * A busbar anchored at a device: it covers the anchor and the next `count - 1` items of the rail
 * (in offset order) and joins their first input (L) or first two inputs (LN) to its feeds.
 */
export type BusbarType = 'L' | 'LN'

export interface Busbar {
  id: string
  type: BusbarType
  /** Appearance only; `null` is the grey default. */
  colour: WireColour | null
  firstElementId: string
  count: number
}

export interface Rail {
  id: string
  spacingMm: number
  elements: PanelElement[]
  terminalBlocks: TerminalBlock[]
  /** Ordered by the offset of their anchor. */
  busbars: Busbar[]
}

export type WireCrossSection = '1' | '1.5' | '2.5' | '4' | '6'

/** Where on a block a wire is attached: top/bottom on a terminal-row block, left/right on a rail block. */
export type ContactSide = 'top' | 'bottom' | 'left' | 'right'

/** The payload carries `contactSide: null` on pole and cable-wire endpoints; the model leaves it out. */
export type Endpoint =
  | { kind: 'pole'; elementId: string; poleIndex: number; side: 'input' | 'output' }
  | { kind: 'terminal'; terminalBlockId: string; terminalIndex: number; contactSide: ContactSide }
  | { kind: 'cableWire'; cableWireId: string }
  | { kind: 'busbar'; busbarId: string; feedIndex: number }

/** An endpoint as a short-circuit group lists it: the contact side is stripped. */
export type NodeEndpoint =
  | Exclude<Endpoint, { kind: 'terminal' }>
  | { kind: 'terminal'; terminalBlockId: string; terminalIndex: number }

/** A point in integer tenths of a millimetre (see `geometry.ts`). */
export interface Bend {
  x: number
  y: number
}

export interface PanelWire {
  id: string
  colour: WireColour
  crossSection: WireCrossSection
  start: Endpoint
  end: Endpoint
  bends: Bend[]
}

export interface ShortCircuit {
  sources: string[]
  wireIds: string[]
  terminals: NodeEndpoint[]
}

/** Side of the drawing a cable kind is placed on (drawing only). */
export type CableSide = 'top' | 'bottom' | 'left' | 'right'

export const CABLE_SIDES: readonly CableSide[] = ['top', 'bottom', 'left', 'right']

/** One of the two terminal rows: `top` (`terminalRow`, above the rails) or `bottom` (`bottomTerminalRow`). */
export type RowId = 'top' | 'bottom'

export const ROW_IDS: readonly RowId[] = ['top', 'bottom']

/** The content key holding the blocks of each row. */
export const ROW_KEYS = {
  top: 'terminalRow',
  bottom: 'bottomTerminalRow',
} as const satisfies Record<RowId, 'terminalRow' | 'bottomTerminalRow'>

export interface PanelContent {
  /** Width of every rail in modules (1..60); also the capacity of both terminal rows. */
  railWidthModules: number
  /** Side of all input cables (default `top`); with an output cable on the same side the inputs come first. */
  inputCableSide: CableSide
  /** Side of all output cables (default `bottom`). */
  outputCableSide: CableSide
  inputCables: InputCable[]
  outputCables: OutputCable[]
  /** Terminal blocks of the top terminal row (above the rails), ordered by offset from the rail start. */
  terminalRow: TerminalBlock[]
  /** Terminal blocks of the bottom terminal row (below the rails and the cables), ordered by offset. */
  bottomTerminalRow: TerminalBlock[]
  rails: Rail[]
  wires: PanelWire[]
}

/** Blocks of a terminal row. */
export function rowBlocks(content: PanelContent, row: RowId): TerminalBlock[] {
  return content[ROW_KEYS[row]]
}

/** The row holding block `blockId`, or null for a rail block or an unknown id. */
export function rowOfBlock(content: PanelContent, blockId: string): RowId | null {
  return ROW_IDS.find((row) => rowBlocks(content, row).some((b) => b.id === blockId)) ?? null
}

/** Key of a drawn contact: the electrical node plus the side it is wired from (hit-testing, rubber band). */
export function drawingKey(e: Endpoint): string {
  return e.kind === 'terminal' ? `${endpointKey(e)}:${e.contactSide}` : endpointKey(e)
}

/** Stable identity of the electrical node an endpoint denotes (same keys as the backend). */
export function endpointKey(e: Endpoint | NodeEndpoint): string {
  switch (e.kind) {
    case 'pole':
      return `p:${e.elementId}:${e.poleIndex}:${e.side}`
    case 'terminal':
      return `t:${e.terminalBlockId}:${e.terminalIndex}`
    case 'cableWire':
      return `w:${e.cableWireId}`
    case 'busbar':
      return `b:${e.busbarId}:${e.feedIndex}`
  }
}

/** Translated name of a wire colour; an unknown colour is returned as it is. */
export function colourName(colour: string, t: Translate): string {
  return isWireColour(colour) ? t(`domain.colour.${colour}`) : colour
}

function isWireColour(colour: string): colour is WireColour {
  return (
    colour === 'black' ||
    colour === 'brown' ||
    colour === 'red' ||
    colour === 'blue' ||
    colour === 'green-yellow'
  )
}

/** Rating text of an input cable ("230 V / 50 Hz / 4 mm²"); not the cable's free-form `label`. */
export function formatInputCableLabel(
  cable: Pick<InputCable, 'voltage' | 'frequency' | 'crossSection'>,
  t: Translate,
): string {
  return t('domain.units.rating', { v: cable.voltage, f: cable.frequency, s: cable.crossSection })
}

/** Medium date + short time in `locale` (a BCP 47 tag, e.g. the current UI language). */
export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** "провід №2" (1-based position in the panel's wire list) for a panel wire id, or null if unknown. */
export function panelWireLabel(content: PanelContent, wireId: string, t: Translate): string | null {
  const index = content.wires.findIndex((w) => w.id === wireId)
  return index === -1 ? null : t('domain.panelWire.short', { n: index + 1 })
}

/** "вхідний кабель 1, провід 2 (коричневий)" for a cable wire id, or null if unknown. */
export function cableWireLabel(content: PanelContent, wireId: string, t: Translate): string | null {
  for (const [i, cable] of content.inputCables.entries()) {
    const j = cable.wires.findIndex((w) => w.id === wireId)
    const wire = cable.wires[j]
    if (wire) {
      return t('domain.cableWire.input', {
        cable: i + 1,
        wire: j + 1,
        colour: colourName(wire.colour, t),
      })
    }
  }
  return null
}

export interface ShortCircuitView {
  sources: string[]
  wires: string[]
}

export function describeShortCircuit(
  content: PanelContent,
  group: ShortCircuit,
  t: Translate,
): ShortCircuitView {
  return {
    sources: group.sources.map((id) => cableWireLabel(content, id, t) ?? id),
    wires: group.wireIds.map((id) => panelWireLabel(content, id, t) ?? id),
  }
}

/** Translated A / B / 0 name of an ATS state. */
export function atsStateName(state: AtsState, t: Translate): string {
  return t(`domain.ats.state.${state}`)
}

/** "Автомат (QF1), 2 мод., полюсів: 2, увімкнено, транзитні полюси: 2". */
export function describeElement(element: PanelElement, t: Translate): string {
  const name =
    element.label || (element.kind === 'ats' ? t('domain.ats.name') : t('domain.element.noName'))
  const title = element.marking ? `${name} (${element.marking})` : name
  if (element.kind === 'ats') {
    return t('domain.element.atsSummary', {
      title,
      width: element.widthModules,
      state: atsStateName(element.state, t),
    })
  }
  const parts = [
    title,
    t('domain.element.modules', { n: element.widthModules }),
    t('domain.element.poles', { n: element.poles.length }),
    element.on ? t('domain.element.on') : t('domain.element.off'),
  ]
  const transit = element.poles.flatMap((p, i) => (p.transit ? [i + 1] : []))
  if (transit.length > 0) parts.push(t('domain.element.transit', { list: transit.join(', ') }))
  return parts.join(', ')
}

function cableWireDescription(content: PanelContent, id: string, t: Translate): string | null {
  const input = cableWireLabel(content, id, t)
  if (input !== null) return input
  for (const [i, cable] of content.outputCables.entries()) {
    const j = cable.wires.findIndex((w) => w.id === id)
    const wire = cable.wires[j]
    if (wire) {
      return t('domain.cableWire.output', {
        cable: i + 1,
        wire: j + 1,
        colour: colourName(wire.colour, t),
      })
    }
  }
  return null
}

/** Human-readable endpoint, e.g. "апарат QF1, полюс 2 (вхід)"; a cable wire falls back to its raw id, an unknown element or terminal block to `?` / `№?`. */
export function describeEndpoint(content: PanelContent, endpoint: Endpoint, t: Translate): string {
  switch (endpoint.kind) {
    case 'cableWire':
      return cableWireDescription(content, endpoint.cableWireId, t) ?? endpoint.cableWireId
    case 'pole': {
      const all = content.rails.flatMap((r) => r.elements)
      const index = all.findIndex((e) => e.id === endpoint.elementId)
      const element = all[index]
      const name = element
        ? element.marking || element.label || t('domain.ordinal', { n: index + 1 })
        : '?'
      if (element?.kind === 'ats') {
        return endpoint.side === 'input'
          ? t('domain.endpoint.atsInput', {
              name,
              source: t(endpoint.poleIndex < 2 ? 'domain.ats.sourceA' : 'domain.ats.sourceB'),
              line: endpoint.poleIndex % 2 === 0 ? 'L' : 'N',
            })
          : t('domain.endpoint.atsOutput', { name, line: endpoint.poleIndex === 0 ? 'L' : 'N' })
      }
      return t('domain.endpoint.device', {
        name,
        pole: endpoint.poleIndex + 1,
        side: t(`domain.side.${endpoint.side}`),
      })
    }
    case 'busbar': {
      const all = content.rails.flatMap((r) => r.busbars)
      const index = all.findIndex((b) => b.id === endpoint.busbarId)
      const busbar = all[index]
      return t('domain.endpoint.busbar', {
        type: busbar ? busbar.type : '?',
        n: index === -1 ? '?' : index + 1,
        feed: endpoint.feedIndex === 0 ? 'L' : 'N',
      })
    }
    case 'terminal': {
      const sideName = t(`domain.contactSide.${endpoint.contactSide}`)
      for (const row of ROW_IDS) {
        const blocks = rowBlocks(content, row)
        const rowIndex = blocks.findIndex((b) => b.id === endpoint.terminalBlockId)
        if (rowIndex === -1) continue
        const block = blocks[rowIndex] as TerminalBlock
        return t('domain.endpoint.rowBlock', {
          row: t(`domain.rowIn.${row}`),
          name: block.label || t('domain.ordinal', { n: rowIndex + 1 }),
          terminal: endpoint.terminalIndex + 1,
          side: sideName,
        })
      }
      const all = content.rails.flatMap((r) => r.terminalBlocks)
      const index = all.findIndex((b) => b.id === endpoint.terminalBlockId)
      const block = all[index]
      return t('domain.endpoint.railBlock', {
        name: block?.label || t('domain.ordinal', { n: index === -1 ? '?' : index + 1 }),
        terminal: endpoint.terminalIndex + 1,
        side: sideName,
      })
    }
  }
}

/** "№1 коричневий, 2.5 мм², від → до". */
export function describePanelWire(
  content: PanelContent,
  wire: PanelWire,
  index: number,
  t: Translate,
): string {
  return t('domain.panelWire.full', {
    n: index + 1,
    colour: colourName(wire.colour, t),
    crossSection: Number(wire.crossSection),
    from: describeEndpoint(content, wire.start, t),
    to: describeEndpoint(content, wire.end, t),
  })
}
