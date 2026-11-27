/**
 * View/editor model of a panel, normalised from the API (validated at runtime; no defaults are applied).
 * Bend coordinates are integer tenths of a millimetre (the API carries mm with one decimal; the API layer
 * converts both ways). Elements and terminal blocks of a rail are ordered by offset.
 */

export type WireColour = 'black' | 'brown' | 'red' | 'blue' | 'green-yellow'

export interface CableWire {
  id: string
  colour: WireColour
}

export interface InputCable {
  id: string
  voltage: number
  frequency: number
  crossSection: number
  wires: CableWire[]
}

export interface OutputCable {
  id: string
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
 * column; in the terminal row its width is `ceil(contacts / 2)` modules.
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

export interface Rail {
  id: string
  widthModules: number
  spacingMm: number
  elements: PanelElement[]
  terminalBlocks: TerminalBlock[]
}

export type WireCrossSection = '1' | '1.5' | '2.5' | '4' | '6'

/** Where on a block a wire is attached: top/bottom on a terminal-row block, left/right on a rail block. */
export type ContactSide = 'top' | 'bottom' | 'left' | 'right'

/** The payload carries `contactSide: null` on pole and cable-wire endpoints; the model leaves it out. */
export type Endpoint =
  | { kind: 'pole'; elementId: string; poleIndex: number; side: 'input' | 'output' }
  | { kind: 'terminal'; terminalBlockId: string; terminalIndex: number; contactSide: ContactSide }
  | { kind: 'cableWire'; cableWireId: string }

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

export interface PanelContent {
  inputCables: InputCable[]
  outputCables: OutputCable[]
  /** Terminal blocks in the terminal row (between the input cables and the first rail), ordered by offset. */
  terminalRow: TerminalBlock[]
  rails: Rail[]
  wires: PanelWire[]
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
  }
}

const COLOUR_NAMES: Record<WireColour, string> = {
  black: 'чорний',
  brown: 'коричневий',
  red: 'червоний',
  blue: 'синій',
  'green-yellow': 'жовто-зелений',
}

export function colourName(colour: string): string {
  return Object.prototype.hasOwnProperty.call(COLOUR_NAMES, colour)
    ? COLOUR_NAMES[colour as WireColour]
    : colour
}

export function formatInputCableLabel(
  cable: Pick<InputCable, 'voltage' | 'frequency' | 'crossSection'>,
): string {
  return `${String(cable.voltage)} V / ${String(cable.frequency)} Hz / ${String(cable.crossSection)} mm²`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Ukrainian plural form: one (1, 21), few (2-4, 22-24), many (the rest, 11-14). */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** "провід №2" (1-based position in the panel's wire list) for a panel wire id, or null if unknown. */
export function panelWireLabel(content: PanelContent, wireId: string): string | null {
  const index = content.wires.findIndex((w) => w.id === wireId)
  return index === -1 ? null : `провід №${index + 1}`
}

/** "вхідний кабель 1, провід 2 (коричневий)" for a cable wire id, or null if unknown. */
export function cableWireLabel(content: PanelContent, wireId: string): string | null {
  for (const [i, cable] of content.inputCables.entries()) {
    const j = cable.wires.findIndex((w) => w.id === wireId)
    const wire = cable.wires[j]
    if (wire) return `вхідний кабель ${i + 1}, провід ${j + 1} (${colourName(wire.colour)})`
  }
  return null
}

export interface ShortCircuitView {
  sources: string[]
  wires: string[]
}

export function describeShortCircuit(content: PanelContent, group: ShortCircuit): ShortCircuitView {
  return {
    sources: group.sources.map((id) => cableWireLabel(content, id) ?? id),
    wires: group.wireIds.map((id) => panelWireLabel(content, id) ?? id),
  }
}

/** "Автомат (QF1), 2 мод., полюсів: 2, увімкнено, транзитні полюси: 2". */
export const ATS_STATE_NAMES: Record<AtsState, string> = { A: 'А', B: 'Б', off: '0' }

export function describeElement(element: PanelElement): string {
  const name = element.label || (element.kind === 'ats' ? 'АВР' : 'Без назви')
  const title = element.marking ? `${name} (${element.marking})` : name
  if (element.kind === 'ats') {
    return `${title}, ${element.widthModules} мод., стан: ${ATS_STATE_NAMES[element.state]}`
  }
  const parts = [
    title,
    `${element.widthModules} мод.`,
    `полюсів: ${element.poles.length}`,
    element.on ? 'увімкнено' : 'вимкнено',
  ]
  const transit = element.poles.flatMap((p, i) => (p.transit ? [i + 1] : []))
  if (transit.length > 0) parts.push(`транзитні полюси: ${transit.join(', ')}`)
  return parts.join(', ')
}

function cableWireDescription(content: PanelContent, id: string): string | null {
  const input = cableWireLabel(content, id)
  if (input !== null) return input
  for (const [i, cable] of content.outputCables.entries()) {
    const j = cable.wires.findIndex((w) => w.id === id)
    const wire = cable.wires[j]
    if (wire) return `вихідний кабель ${i + 1}, провід ${j + 1} (${colourName(wire.colour)})`
  }
  return null
}

const CONTACT_SIDE_NAMES: Record<ContactSide, string> = {
  top: 'зверху',
  bottom: 'знизу',
  left: 'ліворуч',
  right: 'праворуч',
}

/** Human-readable endpoint, e.g. "апарат QF1, полюс 2 (вхід)"; a cable wire falls back to its raw id, an unknown element or terminal block to `?` / `№?`. */
export function describeEndpoint(content: PanelContent, endpoint: Endpoint): string {
  switch (endpoint.kind) {
    case 'cableWire':
      return cableWireDescription(content, endpoint.cableWireId) ?? endpoint.cableWireId
    case 'pole': {
      const all = content.rails.flatMap((r) => r.elements)
      const index = all.findIndex((e) => e.id === endpoint.elementId)
      const element = all[index]
      const name = element ? element.marking || element.label || `№${index + 1}` : '?'
      if (element?.kind === 'ats') {
        return endpoint.side === 'input'
          ? `АВР ${name}, вхід ${endpoint.poleIndex < 2 ? 'А' : 'Б'} ${endpoint.poleIndex % 2 === 0 ? 'L' : 'N'}`
          : `АВР ${name}, вихід ${endpoint.poleIndex === 0 ? 'L' : 'N'}`
      }
      const side = endpoint.side === 'input' ? 'вхід' : 'вихід'
      return `апарат ${name}, полюс ${endpoint.poleIndex + 1} (${side})`
    }
    case 'terminal': {
      const sideName = CONTACT_SIDE_NAMES[endpoint.contactSide]
      const rowIndex = content.terminalRow.findIndex((b) => b.id === endpoint.terminalBlockId)
      if (rowIndex !== -1) {
        const block = content.terminalRow[rowIndex] as TerminalBlock
        return `клемник у рядку ${block.label || `№${rowIndex + 1}`}, клема ${endpoint.terminalIndex + 1} (${sideName})`
      }
      const all = content.rails.flatMap((r) => r.terminalBlocks)
      const index = all.findIndex((b) => b.id === endpoint.terminalBlockId)
      const block = all[index]
      const name = block?.label || `№${index === -1 ? '?' : index + 1}`
      return `клемний блок ${name}, клема ${endpoint.terminalIndex + 1} (${sideName})`
    }
  }
}

/** "№1 коричневий, 2.5 мм², від → до". */
export function describePanelWire(content: PanelContent, wire: PanelWire, index: number): string {
  return `№${index + 1} ${colourName(wire.colour)}, ${wire.crossSection} мм², ${describeEndpoint(content, wire.start)} → ${describeEndpoint(content, wire.end)}`
}
