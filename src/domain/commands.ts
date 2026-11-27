/**
 * Editor commands: pure `(content) => outcome` functions with structural sharing (only the changed
 * path is copied). A rejected command leaves the content untouched. Structural commands cascade
 * wire deletion (panel-domain) and repair routes whose endpoints moved (E3); elements and terminal
 * blocks stay sorted by offset (E6). Ids are supplied by the caller (crypto.randomUUID()).
 */
import { computeLayout, endpointPoint, type Pt } from './geometry'
import { buildIndex } from './contentIndex'
import {
  CABLE_CROSS_SECTION_RULE,
  checkDecimal,
  codePointLength,
  DEFAULT_CABLE_CROSS_SECTION,
  DEFAULT_FREQUENCY,
  DEFAULT_RAIL_SPACING_MM,
  DEFAULT_VOLTAGE,
  DEVICE_STYLES,
  FREQUENCY_RULE,
  ATS_MIN_WIDTH,
  BLOCK_COLOURS,
  MAX_RAIL_BLOCK_TERMINALS,
  MAX_ROW_BLOCK_TERMINALS,
  MAX_ROW_BLOCKS,
  rowBlockWidth,
  MAX_BENDS_PER_WIRE,
  MAX_CABLE_WIRES,
  MAX_DESCRIPTION_LENGTH,
  MAX_INPUT_CABLES,
  MAX_LABEL_LENGTH,
  MAX_MARKING_LENGTH,
  MAX_OUTPUT_CABLES,
  MAX_RAIL_WIDTH,
  MAX_RAILS,
  MAX_TOTAL_BENDS,
  MAX_COORD_U,
  roundTo,
  MAX_WIRES,
  maxPolesForWidth,
  SPACING_RULE,
  VOLTAGE_RULE,
  WIRE_COLOURS,
  WIRE_CROSS_SECTIONS,
} from './limits'
import {
  checkElementWidth,
  checkPlacement,
  checkRailWidth,
  checkRowPlacement,
  type PlacementError,
} from './placement'
import {
  autoRouteFor,
  insertBend as insertBendOp,
  moveBend as moveBendOp,
  removeBend as removeBendOp,
  repairRoutes,
} from './routes'
import {
  endpointKey,
  type AtsState,
  type AtsElement,
  type CableWire,
  type DeviceElement,
  type DeviceStyle,
  type Endpoint,
  type InputCable,
  type OutputCable,
  type PanelContent,
  type PanelElement,
  type PanelWire,
  type Rail,
  type TerminalBlock,
  type WireColour,
  type WireCrossSection,
} from './panelContent'

export type Rejection =
  | PlacementError
  | 'notFound'
  | 'duplicateId'
  | 'limit'
  | 'invalid'
  | 'lastInputCable'
  | 'lastCableWire'
  | 'sameTerminal'
  | 'readOnly'

export type CommandOutcome =
  | { ok: true; content: PanelContent; removedWires: number }
  | { ok: false; reason: Rejection; detail?: string }

export type Command = (content: PanelContent) => CommandOutcome

class Rejected extends Error {
  constructor(
    readonly reason: Rejection,
    readonly detail?: string,
  ) {
    super(reason)
  }
}

function reject(reason: Rejection, detail?: string): never {
  throw new Rejected(reason, detail)
}

interface Done {
  content: PanelContent
  removedWires: number
}

/** Wraps a command body; `Done`/content return values are normalised and rejections become outcomes. */
function define(body: (content: PanelContent) => Done | PanelContent): Command {
  return (content) => {
    try {
      const result = body(content)
      return 'removedWires' in result
        ? { ok: true, content: result.content, removedWires: result.removedWires }
        : { ok: true, content: result, removedWires: 0 }
    } catch (error) {
      if (error instanceof Rejected) {
        return error.detail === undefined
          ? { ok: false, reason: error.reason }
          : { ok: false, reason: error.reason, detail: error.detail }
      }
      throw error
    }
  }
}

// ---- helpers ----

function railIndexOf(content: PanelContent, id: string): number {
  const i = content.rails.findIndex((r) => r.id === id)
  if (i === -1) reject('notFound', id)
  return i
}

function replaceRail(content: PanelContent, index: number, rail: Rail): PanelContent {
  return { ...content, rails: content.rails.map((r, i) => (i === index ? rail : r)) }
}

function isSortedByOffset(items: readonly { offsetModules: number }[]): boolean {
  return items.every(
    (it, i) =>
      i === 0 || (items[i - 1] as { offsetModules: number }).offsetModules <= it.offsetModules,
  )
}

/** Keeps elements/blocks ordered by offset; returns the same rail when already ordered. */
function sortedRail(rail: Rail): Rail {
  const elementsOk = isSortedByOffset(rail.elements)
  const blocksOk = isSortedByOffset(rail.terminalBlocks)
  if (elementsOk && blocksOk) return rail
  return {
    ...rail,
    elements: elementsOk
      ? rail.elements
      : [...rail.elements].sort((a, b) => a.offsetModules - b.offsetModules),
    terminalBlocks: blocksOk
      ? rail.terminalBlocks
      : [...rail.terminalBlocks].sort((a, b) => a.offsetModules - b.offsetModules),
  }
}

/** Keeps the terminal row ordered by offset; returns the same array when already ordered. */
function sortedRow(row: TerminalBlock[]): TerminalBlock[] {
  return isSortedByOffset(row) ? row : [...row].sort((a, b) => a.offsetModules - b.offsetModules)
}

function allIds(content: PanelContent): Set<string> {
  const ids = new Set<string>()
  for (const c of content.inputCables) {
    ids.add(c.id)
    c.wires.forEach((w) => ids.add(w.id))
  }
  for (const c of content.outputCables) {
    ids.add(c.id)
    c.wires.forEach((w) => ids.add(w.id))
  }
  content.terminalRow.forEach((b) => ids.add(b.id))
  for (const r of content.rails) {
    ids.add(r.id)
    r.elements.forEach((e) => ids.add(e.id))
    r.terminalBlocks.forEach((b) => ids.add(b.id))
  }
  content.wires.forEach((w) => ids.add(w.id))
  return ids
}

function requireFreeIds(content: PanelContent, ...ids: string[]): void {
  const taken = allIds(content)
  const seen = new Set<string>()
  for (const id of ids) {
    if (taken.has(id) || seen.has(id)) reject('duplicateId', id)
    seen.add(id)
  }
}

function requireText(value: string, max: number): void {
  if (codePointLength(value) > max) reject('invalid', `text longer than ${max}`)
}

/** Validates a decimal like the backend does and returns the value rounded to the rule's scale. */
function requireDecimal(value: number, rule: Parameters<typeof checkDecimal>[1]): number {
  const message = checkDecimal(value, rule)
  if (message) reject('invalid', message)
  return roundTo(value, rule.scale)
}

/** Rejects content whose drawing would exceed the coordinate range (e.g. huge rail spacing). */
function requireDrawingInRange(content: PanelContent): void {
  const layout = computeLayout(content)
  if (layout.height > MAX_COORD_U || layout.width > MAX_COORD_U) reject('limit', 'coordinates')
}

/** Removes every wire with an endpoint matching `attached`; returns the count. */
function dropWires(content: PanelContent, attached: (e: Endpoint) => boolean): Done {
  const wires = content.wires.filter((w) => !attached(w.start) && !attached(w.end))
  if (wires.length === content.wires.length) return { content, removedWires: 0 }
  return { content: { ...content, wires }, removedWires: content.wires.length - wires.length }
}

/** Cascade + route repair: `before` is the content the command started from. */
function settle(before: PanelContent, after: PanelContent, removedWires: number): Done {
  return { content: repairRoutes(before, after), removedWires }
}

function elementHasEndpoints(ids: ReadonlySet<string>) {
  return (e: Endpoint) =>
    (e.kind === 'pole' && ids.has(e.elementId)) ||
    (e.kind === 'terminal' && ids.has(e.terminalBlockId))
}

function cableWireEndpoints(ids: ReadonlySet<string>) {
  return (e: Endpoint) => e.kind === 'cableWire' && ids.has(e.cableWireId)
}

function checkCableWires(wires: readonly CableWire[]): void {
  if (wires.length < 1 || wires.length > MAX_CABLE_WIRES) reject('limit', 'cable wires')
  for (const w of wires) if (!WIRE_COLOURS.includes(w.colour)) reject('invalid', 'colour')
}

export function totalBends(content: PanelContent): number {
  return content.wires.reduce((sum, w) => sum + w.bends.length, 0)
}

// ---- factories for defaults ----

export function defaultInputCable(id: string, wireId: string): InputCable {
  return {
    id,
    voltage: DEFAULT_VOLTAGE,
    frequency: DEFAULT_FREQUENCY,
    crossSection: DEFAULT_CABLE_CROSS_SECTION,
    wires: [{ id: wireId, colour: 'brown' }],
  }
}

export function defaultOutputCable(id: string, wireId: string): OutputCable {
  return { id, description: '', wires: [{ id: wireId, colour: 'brown' }] }
}

// ---- rails ----

export function addRail(rail: { id: string; widthModules?: number; spacingMm?: number }): Command {
  return define((content) => {
    if (content.rails.length >= MAX_RAILS) reject('limit', 'rails')
    const widthModules = rail.widthModules ?? MAX_RAIL_WIDTH
    if (!Number.isInteger(widthModules) || widthModules < 1 || widthModules > MAX_RAIL_WIDTH)
      reject('invalid', 'width')
    const spacingMm = requireDecimal(rail.spacingMm ?? DEFAULT_RAIL_SPACING_MM, SPACING_RULE)
    requireFreeIds(content, rail.id)
    const created: Rail = { id: rail.id, widthModules, spacingMm, elements: [], terminalBlocks: [] }
    const after = { ...content, rails: [...content.rails, created] }
    requireDrawingInRange(after)
    return settle(content, after, 0)
  })
}

export function removeRail(railId: string): Command {
  return define((content) => {
    const index = railIndexOf(content, railId)
    const rail = content.rails[index] as Rail
    const ids = new Set([
      ...rail.elements.map((e) => e.id),
      ...rail.terminalBlocks.map((b) => b.id),
    ])
    const without = { ...content, rails: content.rails.filter((_, i) => i !== index) }
    const cascade = dropWires(without, elementHasEndpoints(ids))
    return settle(content, cascade.content, cascade.removedWires)
  })
}

export function updateRail(
  railId: string,
  patch: { widthModules?: number; spacingMm?: number },
): Command {
  return define((content) => {
    const index = railIndexOf(content, railId)
    const rail = content.rails[index] as Rail
    const widthModules = patch.widthModules ?? rail.widthModules
    let spacingMm = patch.spacingMm ?? rail.spacingMm
    if (spacingMm !== rail.spacingMm) spacingMm = requireDecimal(spacingMm, SPACING_RULE)
    if (widthModules === rail.widthModules && spacingMm === rail.spacingMm) return content
    if (widthModules !== rail.widthModules) {
      const error = checkRailWidth(rail, widthModules)
      if (error) reject(error)
    }
    const after = replaceRail(content, index, { ...rail, widthModules, spacingMm })
    requireDrawingInRange(after)
    return settle(content, after, 0)
  })
}

// ---- elements ----

function elementLocation(content: PanelContent, id: string) {
  for (const [railIndex, rail] of content.rails.entries()) {
    const index = rail.elements.findIndex((e) => e.id === id)
    if (index !== -1)
      return { railIndex, rail, index, element: rail.elements[index] as PanelElement }
  }
  return reject('notFound', id)
}

function blockLocation(content: PanelContent, id: string) {
  const rowIndex = content.terminalRow.findIndex((b) => b.id === id)
  if (rowIndex !== -1) {
    return {
      zone: 'row' as const,
      block: content.terminalRow[rowIndex] as TerminalBlock,
      index: rowIndex,
    }
  }
  for (const [railIndex, rail] of content.rails.entries()) {
    const index = rail.terminalBlocks.findIndex((b) => b.id === id)
    if (index !== -1) {
      return {
        zone: 'rail' as const,
        railIndex,
        rail,
        index,
        block: rail.terminalBlocks[index] as TerminalBlock,
      }
    }
  }
  return reject('notFound', id)
}

export function addElement(railId: string, element: PanelElement): Command {
  return define((content) => {
    const railIndex = railIndexOf(content, railId)
    const rail = content.rails[railIndex] as Rail
    requireFreeIds(content, element.id)
    requireText(element.label, MAX_LABEL_LENGTH)
    requireText(element.marking, MAX_MARKING_LENGTH)
    if (element.kind === 'ats') {
      if (element.widthModules < ATS_MIN_WIDTH) reject('tooNarrowForAts')
      if (!ATS_STATES.includes(element.state)) reject('invalid', 'state')
    } else if (
      element.poles.length < 1 ||
      element.poles.length > maxPolesForWidth(element.widthModules)
    ) {
      reject('tooNarrowForPoles')
    }
    const error = checkPlacement(rail, null, element.offsetModules, element.widthModules)
    if (error) reject(error)
    const next = sortedRail({ ...rail, elements: [...rail.elements, element] })
    return settle(content, replaceRail(content, railIndex, next), 0)
  })
}

const ATS_STATES: readonly AtsState[] = ['A', 'B', 'off']

export interface ElementPatch {
  /** Devices only; keeps width and poles. */
  style?: DeviceStyle
  widthModules?: number
  /** Devices only. */
  poleCount?: number
  label?: string
  marking?: string
  /** Devices only. */
  on?: boolean
  sidesSwapped?: boolean
  /** ATS only. */
  state?: AtsState
}

/** Applies the patch to an ATS (kind never changes); returns the same object when nothing differs. */
function patchAts(element: AtsElement, patch: ElementPatch): AtsElement {
  if (patch.poleCount !== undefined || patch.on !== undefined || patch.style !== undefined) {
    reject('invalid', 'kind')
  }
  const state = patch.state ?? element.state
  if (!ATS_STATES.includes(state)) reject('invalid', 'state')
  const next: AtsElement = {
    ...element,
    widthModules: patch.widthModules ?? element.widthModules,
    label: patch.label ?? element.label,
    marking: patch.marking ?? element.marking,
    sidesSwapped: patch.sidesSwapped ?? element.sidesSwapped,
    state,
  }
  return next
}

function patchDevice(
  element: DeviceElement,
  patch: ElementPatch,
): { next: DeviceElement; poleCount: number } {
  if (patch.state !== undefined) reject('invalid', 'kind')
  const style = patch.style ?? element.style
  if (!DEVICE_STYLES.includes(style)) reject('invalid', 'style')
  const poleCount = patch.poleCount ?? element.poles.length
  if (!Number.isInteger(poleCount) || poleCount < 1) reject('invalid', 'poles')
  const poles =
    poleCount === element.poles.length
      ? element.poles
      : poleCount < element.poles.length
        ? element.poles.slice(0, poleCount)
        : [
            ...element.poles,
            ...Array.from({ length: poleCount - element.poles.length }, () => ({
              transit: false,
            })),
          ]
  return {
    poleCount,
    next: {
      ...element,
      style,
      widthModules: patch.widthModules ?? element.widthModules,
      label: patch.label ?? element.label,
      marking: patch.marking ?? element.marking,
      on: patch.on ?? element.on,
      sidesSwapped: patch.sidesSwapped ?? element.sidesSwapped,
      poles,
    },
  }
}

export function updateElement(id: string, patch: ElementPatch): Command {
  return define((content) => {
    const { railIndex, rail, index, element } = elementLocation(content, id)
    let next: PanelElement
    let poleCount = 0
    if (element.kind === 'ats') {
      next = patchAts(element, patch)
    } else {
      const patched = patchDevice(element, patch)
      next = patched.next
      poleCount = patched.poleCount
    }
    if (next.label !== element.label) requireText(next.label, MAX_LABEL_LENGTH)
    if (next.marking !== element.marking) requireText(next.marking, MAX_MARKING_LENGTH)
    const polesChanged = element.kind === 'device' && poleCount !== element.poles.length
    if (next.widthModules !== element.widthModules || polesChanged) {
      const error = checkElementWidth(rail, element, next.widthModules, poleCount)
      if (error) reject(error)
    }
    if (
      next.widthModules === element.widthModules &&
      !polesChanged &&
      next.label === element.label &&
      next.marking === element.marking &&
      next.on === element.on &&
      next.style === element.style &&
      next.state === element.state &&
      next.sidesSwapped === element.sidesSwapped
    ) {
      return content
    }
    const elements = rail.elements.map((e, i) => (i === index ? next : e))
    const after = replaceRail(content, railIndex, { ...rail, elements })
    const cascade =
      element.kind === 'device' && poleCount < element.poles.length
        ? dropWires(
            after,
            (e) => e.kind === 'pole' && e.elementId === id && e.poleIndex >= poleCount,
          )
        : { content: after, removedWires: 0 }
    return settle(content, cascade.content, cascade.removedWires)
  })
}

export function setPoleTransit(elementId: string, poleIndex: number, transit: boolean): Command {
  return define((content) => {
    const { railIndex, rail, index, element } = elementLocation(content, elementId)
    if (element.kind !== 'device') reject('invalid', 'kind')
    const pole = element.poles[poleIndex]
    if (!pole) reject('notFound', `pole ${poleIndex}`)
    if (pole.transit === transit) return content
    const poles = element.poles.map((p, i) => (i === poleIndex ? { transit } : p))
    const elements = rail.elements.map((e, i) => (i === index ? { ...element, poles } : e))
    return replaceRail(content, railIndex, { ...rail, elements })
  })
}

export function removeElement(id: string): Command {
  return define((content) => {
    const { railIndex, rail, index } = elementLocation(content, id)
    const after = replaceRail(content, railIndex, {
      ...rail,
      elements: rail.elements.filter((_, i) => i !== index),
    })
    const cascade = dropWires(after, (e) => e.kind === 'pole' && e.elementId === id)
    return settle(content, cascade.content, cascade.removedWires)
  })
}

// ---- terminal blocks ----

function checkBlockBasics(block: TerminalBlock, row: boolean): void {
  requireText(block.label, MAX_LABEL_LENGTH)
  if (!BLOCK_COLOURS.includes(block.colour)) reject('invalid', 'colour')
  const max = row ? MAX_ROW_BLOCK_TERMINALS : MAX_RAIL_BLOCK_TERMINALS
  if (!Number.isInteger(block.terminalCount) || block.terminalCount < 1) {
    reject('invalid', 'terminals')
  }
  if (block.terminalCount > max) reject('limit', row ? 'row terminals' : 'rail terminals')
  if (row ? block.widthModules !== rowBlockWidth(block.terminalCount) : block.widthModules !== 1) {
    reject('invalid', 'width')
  }
}

/** Adds a block (width 1, 1..12 contacts) to a rail. */
export function addBlock(railId: string, block: TerminalBlock): Command {
  return define((content) => {
    const railIndex = railIndexOf(content, railId)
    const rail = content.rails[railIndex] as Rail
    requireFreeIds(content, block.id)
    checkBlockBasics(block, false)
    const placement = checkPlacement(rail, null, block.offsetModules, block.widthModules)
    if (placement) reject(placement)
    const next = sortedRail({ ...rail, terminalBlocks: [...rail.terminalBlocks, block] })
    return settle(content, replaceRail(content, railIndex, next), 0)
  })
}

/** Adds a block (1..60 contacts, width `ceil(contacts / 2)`) to the terminal row. */
export function addRowBlock(block: TerminalBlock): Command {
  return define((content) => {
    if (content.terminalRow.length >= MAX_ROW_BLOCKS) reject('limit', 'row blocks')
    requireFreeIds(content, block.id)
    checkBlockBasics(block, true)
    const placement = checkRowPlacement(
      content.terminalRow,
      null,
      block.offsetModules,
      block.widthModules,
    )
    if (placement) reject(placement)
    const terminalRow = sortedRow([...content.terminalRow, block])
    return settle(content, { ...content, terminalRow }, 0)
  })
}

export interface BlockPatch {
  terminalCount?: number
  /** `null` = grey. */
  colour?: WireColour | null
  label?: string
}

/**
 * Colour, label and contact count of a block. A rail block keeps width 1 (1..12 contacts); a row
 * block's width follows `ceil(contacts / 2)` and must still fit (no overlap, within 60 modules).
 * Fewer contacts delete the wires attached to the removed ones.
 */
export function updateBlock(id: string, patch: BlockPatch): Command {
  return define((content) => {
    const found = blockLocation(content, id)
    const block = found.block
    const row = found.zone === 'row'
    const terminalCount = patch.terminalCount ?? block.terminalCount
    const colour = patch.colour === undefined ? block.colour : patch.colour
    const label = patch.label ?? block.label
    const widthModules = row ? rowBlockWidth(terminalCount) : 1
    if (terminalCount === block.terminalCount && colour === block.colour && label === block.label) {
      return content
    }
    const updated: TerminalBlock = { ...block, terminalCount, colour, label, widthModules }
    checkBlockBasics(updated, row)
    if (row && widthModules !== block.widthModules) {
      const error = checkRowPlacement(content.terminalRow, id, block.offsetModules, widthModules)
      if (error) reject(error)
    }
    const after =
      found.zone === 'row'
        ? {
            ...content,
            terminalRow: content.terminalRow.map((b, i) => (i === found.index ? updated : b)),
          }
        : replaceRail(content, found.railIndex, {
            ...found.rail,
            terminalBlocks: found.rail.terminalBlocks.map((b, i) =>
              i === found.index ? updated : b,
            ),
          })
    const cascade =
      terminalCount < block.terminalCount
        ? dropWires(
            after,
            (e) =>
              e.kind === 'terminal' && e.terminalBlockId === id && e.terminalIndex >= terminalCount,
          )
        : { content: after, removedWires: 0 }
    return settle(content, cascade.content, cascade.removedWires)
  })
}

export function removeBlock(id: string): Command {
  return define((content) => {
    const found = blockLocation(content, id)
    const after =
      found.zone === 'row'
        ? { ...content, terminalRow: content.terminalRow.filter((_, i) => i !== found.index) }
        : replaceRail(content, found.railIndex, {
            ...found.rail,
            terminalBlocks: found.rail.terminalBlocks.filter((_, i) => i !== found.index),
          })
    const cascade = dropWires(after, (e) => e.kind === 'terminal' && e.terminalBlockId === id)
    return settle(content, cascade.content, cascade.removedWires)
  })
}

/** Moves an element or rail block within its rail or to another rail; the item id is preserved. */
export function moveItem(itemId: string, targetRailId: string, offsetModules: number): Command {
  return define((content) => {
    const idx = buildIndex(content)
    const targetIndex = railIndexOf(content, targetRailId)
    const element = idx.elements.get(itemId)
    const block = idx.blocks.get(itemId)
    const found = element ?? block
    if (!found) reject('notFound', itemId)
    if (!found.rail) reject('invalid', 'row block')
    const item = element ? element.element : (block as NonNullable<typeof block>).block
    const target = content.rails[targetIndex] as Rail
    if (found.rail.id === targetRailId && item.offsetModules === offsetModules) return content
    const error = checkPlacement(target, itemId, offsetModules, item.widthModules)
    if (error) reject(error)
    const moved = { ...item, offsetModules }
    const rails = content.rails.map((rail) => {
      if (rail.id !== (found.rail as Rail).id && rail.id !== targetRailId) return rail
      let next = rail
      if (rail.id === (found.rail as Rail).id) {
        next = element
          ? { ...next, elements: next.elements.filter((e) => e.id !== itemId) }
          : { ...next, terminalBlocks: next.terminalBlocks.filter((b) => b.id !== itemId) }
      }
      if (rail.id === targetRailId) {
        next = element
          ? { ...next, elements: [...next.elements, moved as PanelElement] }
          : { ...next, terminalBlocks: [...next.terminalBlocks, moved as TerminalBlock] }
      }
      return sortedRail(next)
    })
    return settle(content, { ...content, rails }, 0)
  })
}

/** Moves a terminal-row block along the row; the id and its wires are preserved. */
export function moveRowBlock(blockId: string, offsetModules: number): Command {
  return define((content) => {
    const index = content.terminalRow.findIndex((b) => b.id === blockId)
    const block = content.terminalRow[index]
    if (!block) reject('notFound', blockId)
    if (block.offsetModules === offsetModules) return content
    const error = checkRowPlacement(content.terminalRow, blockId, offsetModules, block.widthModules)
    if (error) reject(error)
    const terminalRow = sortedRow(
      content.terminalRow.map((b, i) => (i === index ? { ...block, offsetModules } : b)),
    )
    return settle(content, { ...content, terminalRow }, 0)
  })
}

/** Re-enters a rejected nested command as a rejection of the outer one. */
function unwrap(outcome: CommandOutcome): Done {
  if (!outcome.ok) return reject(outcome.reason, outcome.detail)
  return { content: outcome.content, removedWires: outcome.removedWires }
}

/** Where a copy is dropped: a rail (elements, ATS, rail blocks) or the terminal row (row blocks). */
export type CopyTarget = { railId: string } | { row: true }

/**
 * Copies an element, ATS or terminal block (all settings, the new id, no wires) to the drop place.
 * Rail items go to rails, row blocks to the row; any other zone combination is rejected.
 */
export function copyItem(
  itemId: string,
  newId: string,
  target: CopyTarget,
  offsetModules: number,
): Command {
  return define((content) => {
    const found = buildIndex(content)
    const element = found.elements.get(itemId)?.element
    const block = found.blocks.get(itemId)
    if (!element && !block) reject('notFound', itemId)
    const intoRow = 'row' in target
    if (element) {
      if (intoRow) reject('invalid', 'zone')
      return unwrap(addElement(target.railId, { ...element, id: newId, offsetModules })(content))
    }
    const source = (block as NonNullable<typeof block>).block
    const fromRow = (block as NonNullable<typeof block>).rail === null
    if (fromRow !== intoRow) reject('invalid', 'zone')
    const copy = { ...source, id: newId, offsetModules }
    return unwrap(intoRow ? addRowBlock(copy)(content) : addBlock(target.railId, copy)(content))
  })
}

// ---- cables ----

export function addInputCable(cable: InputCable): Command {
  return define((content) => {
    if (content.inputCables.length >= MAX_INPUT_CABLES) reject('limit', 'input cables')
    requireFreeIds(content, cable.id, ...cable.wires.map((w) => w.id))
    const rounded = {
      ...cable,
      voltage: requireDecimal(cable.voltage, VOLTAGE_RULE),
      frequency: requireDecimal(cable.frequency, FREQUENCY_RULE),
      crossSection: requireDecimal(cable.crossSection, CABLE_CROSS_SECTION_RULE),
    }
    checkCableWires(cable.wires)
    return settle(content, { ...content, inputCables: [...content.inputCables, rounded] }, 0)
  })
}

export function updateInputCable(
  id: string,
  patch: { voltage?: number; frequency?: number; crossSection?: number },
): Command {
  return define((content) => {
    const index = content.inputCables.findIndex((c) => c.id === id)
    const cable = content.inputCables[index]
    if (!cable) reject('notFound', id)
    const next = { ...cable, ...definedOnly(patch) }
    if (next.voltage !== cable.voltage) next.voltage = requireDecimal(next.voltage, VOLTAGE_RULE)
    if (next.frequency !== cable.frequency) {
      next.frequency = requireDecimal(next.frequency, FREQUENCY_RULE)
    }
    if (next.crossSection !== cable.crossSection) {
      next.crossSection = requireDecimal(next.crossSection, CABLE_CROSS_SECTION_RULE)
    }
    if (
      next.voltage === cable.voltage &&
      next.frequency === cable.frequency &&
      next.crossSection === cable.crossSection
    ) {
      return content
    }
    return { ...content, inputCables: content.inputCables.map((c, i) => (i === index ? next : c)) }
  })
}

/** Drops keys whose value is undefined so a patch never overwrites a field with `undefined`. */
function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function removeInputCable(id: string): Command {
  return define((content) => {
    const cable = content.inputCables.find((c) => c.id === id)
    if (!cable) reject('notFound', id)
    if (content.inputCables.length <= 1) reject('lastInputCable')
    const after = { ...content, inputCables: content.inputCables.filter((c) => c.id !== id) }
    const cascade = dropWires(after, cableWireEndpoints(new Set(cable.wires.map((w) => w.id))))
    return settle(content, cascade.content, cascade.removedWires)
  })
}

export function addOutputCable(cable: OutputCable): Command {
  return define((content) => {
    if (content.outputCables.length >= MAX_OUTPUT_CABLES) reject('limit', 'output cables')
    requireFreeIds(content, cable.id, ...cable.wires.map((w) => w.id))
    requireText(cable.description, MAX_DESCRIPTION_LENGTH)
    checkCableWires(cable.wires)
    return settle(content, { ...content, outputCables: [...content.outputCables, cable] }, 0)
  })
}

export function updateOutputCable(id: string, patch: { description: string }): Command {
  return define((content) => {
    const index = content.outputCables.findIndex((c) => c.id === id)
    const cable = content.outputCables[index]
    if (!cable) reject('notFound', id)
    if (patch.description === cable.description) return content
    requireText(patch.description, MAX_DESCRIPTION_LENGTH)
    return {
      ...content,
      outputCables: content.outputCables.map((c, i) =>
        i === index ? { ...cable, description: patch.description } : c,
      ),
    }
  })
}

export function removeOutputCable(id: string): Command {
  return define((content) => {
    const cable = content.outputCables.find((c) => c.id === id)
    if (!cable) reject('notFound', id)
    const after = { ...content, outputCables: content.outputCables.filter((c) => c.id !== id) }
    const cascade = dropWires(after, cableWireEndpoints(new Set(cable.wires.map((w) => w.id))))
    return settle(content, cascade.content, cascade.removedWires)
  })
}

function cableOfWire(content: PanelContent, wireId: string) {
  const input = content.inputCables.findIndex((c) => c.wires.some((w) => w.id === wireId))
  if (input !== -1)
    return { kind: 'input' as const, index: input, cable: content.inputCables[input] as InputCable }
  const output = content.outputCables.findIndex((c) => c.wires.some((w) => w.id === wireId))
  if (output !== -1)
    return {
      kind: 'output' as const,
      index: output,
      cable: content.outputCables[output] as OutputCable,
    }
  return reject('notFound', wireId)
}

function withCable(
  content: PanelContent,
  found: ReturnType<typeof cableOfWire>,
  wires: CableWire[],
): PanelContent {
  if (found.kind === 'input') {
    const next = { ...(found.cable as InputCable), wires }
    return {
      ...content,
      inputCables: content.inputCables.map((c, i) => (i === found.index ? next : c)),
    }
  }
  const next = { ...(found.cable as OutputCable), wires }
  return {
    ...content,
    outputCables: content.outputCables.map((c, i) => (i === found.index ? next : c)),
  }
}

/** Appends a wire to a cable (existing wire positions stay unchanged). */
export function addCableWire(cableId: string, wire: CableWire): Command {
  return define((content) => {
    const probe =
      content.inputCables.find((c) => c.id === cableId) ??
      content.outputCables.find((c) => c.id === cableId)
    if (!probe) reject('notFound', cableId)
    if (probe.wires.length >= MAX_CABLE_WIRES) reject('limit', 'cable wires')
    requireFreeIds(content, wire.id)
    if (!WIRE_COLOURS.includes(wire.colour)) reject('invalid', 'colour')
    const found = cableOfWire(content, (probe.wires[0] as CableWire).id)
    return settle(content, withCable(content, found, [...probe.wires, wire]), 0)
  })
}

export function removeCableWire(wireId: string): Command {
  return define((content) => {
    const found = cableOfWire(content, wireId)
    if (found.cable.wires.length <= 1) reject('lastCableWire')
    const after = withCable(
      content,
      found,
      found.cable.wires.filter((w) => w.id !== wireId),
    )
    const cascade = dropWires(after, cableWireEndpoints(new Set([wireId])))
    return settle(content, cascade.content, cascade.removedWires)
  })
}

export function updateCableWire(wireId: string, patch: { colour: WireColour }): Command {
  return define((content) => {
    const found = cableOfWire(content, wireId)
    const wire = found.cable.wires.find((w) => w.id === wireId) as CableWire
    if (wire.colour === patch.colour) return content
    if (!WIRE_COLOURS.includes(patch.colour)) reject('invalid', 'colour')
    return withCable(
      content,
      found,
      found.cable.wires.map((w) => (w.id === wireId ? { ...w, colour: patch.colour } : w)),
    )
  })
}

// ---- panel wires ----

function replaceWire(content: PanelContent, index: number, wire: PanelWire): PanelContent {
  return { ...content, wires: content.wires.map((w, i) => (i === index ? wire : w)) }
}

function wireLocation(content: PanelContent, id: string) {
  const index = content.wires.findIndex((w) => w.id === id)
  const wire = content.wires[index]
  if (!wire) reject('notFound', id)
  return { index, wire }
}

export interface NewWire {
  id: string
  start: Endpoint
  end: Endpoint
  colour: WireColour
  crossSection: WireCrossSection
  /** The drawn route (integer tenths of mm); every segment must be horizontal or vertical. */
  bends: Pt[]
}

/** Adds a wire between two existing terminals along the bends the user drew (no auto route). */
export function addWire(spec: NewWire): Command {
  return define((content) => {
    if (content.wires.length >= MAX_WIRES) reject('limit', 'wires')
    requireFreeIds(content, spec.id)
    if (!WIRE_COLOURS.includes(spec.colour) || !WIRE_CROSS_SECTIONS.includes(spec.crossSection)) {
      reject('invalid', 'style')
    }
    const layout = computeLayout(content)
    if (!endpointPoint(layout, spec.start) || !endpointPoint(layout, spec.end))
      reject('notFound', 'endpoint')
    if (endpointKey(spec.start) === endpointKey(spec.end)) reject('sameTerminal')
    const bends = spec.bends
    const startPt = endpointPoint(layout, spec.start) as Pt
    const endPt = endpointPoint(layout, spec.end) as Pt
    if (bends.length > MAX_BENDS_PER_WIRE) reject('limit', 'bends')
    if (bends.some((b) => !Number.isInteger(b.x) || !Number.isInteger(b.y)))
      reject('invalid', 'bends')
    const route = [startPt, ...bends, endPt]
    if (
      route.some(
        (p, i) => i > 0 && p.x !== (route[i - 1] as Pt).x && p.y !== (route[i - 1] as Pt).y,
      )
    ) {
      reject('invalid', 'orthogonal')
    }
    if (bends.some((b) => b.x < 0 || b.y < 0 || b.x > MAX_COORD_U || b.y > MAX_COORD_U)) {
      reject('limit', 'coordinates')
    }
    if (totalBends(content) + bends.length > MAX_TOTAL_BENDS) reject('limit', 'bends')
    return { ...content, wires: [...content.wires, { ...spec, bends }] }
  })
}

export function removeWire(id: string): Command {
  return define((content) => {
    wireLocation(content, id)
    return { ...content, wires: content.wires.filter((w) => w.id !== id) }
  })
}

export function updateWire(
  id: string,
  patch: { colour?: WireColour; crossSection?: WireCrossSection },
): Command {
  return define((content) => {
    const { index, wire } = wireLocation(content, id)
    const colour = patch.colour ?? wire.colour
    const crossSection = patch.crossSection ?? wire.crossSection
    if (colour === wire.colour && crossSection === wire.crossSection) return content
    if (!WIRE_COLOURS.includes(colour) || !WIRE_CROSS_SECTIONS.includes(crossSection))
      reject('invalid', 'style')
    return replaceWire(content, index, { ...wire, colour, crossSection })
  })
}

function pathOf(content: PanelContent, wire: PanelWire) {
  const layout = computeLayout(content)
  const start = endpointPoint(layout, wire.start)
  const end = endpointPoint(layout, wire.end)
  if (!start || !end) reject('notFound', wire.id)
  return { layout, path: { start, end, bends: wire.bends } }
}

function withBends(
  content: PanelContent,
  index: number,
  wire: PanelWire,
  bends: Pt[],
): PanelContent {
  if (
    bends.length === wire.bends.length &&
    bends.every((b, i) => b.x === wire.bends[i]?.x && b.y === wire.bends[i]?.y)
  ) {
    return content
  }
  return replaceWire(content, index, { ...wire, bends })
}

export function moveBend(wireId: string, k: number, to: Pt): Command {
  return define((content) => {
    const { index, wire } = wireLocation(content, wireId)
    if (!wire.bends[k]) reject('notFound', `bend ${k}`)
    const { path } = pathOf(content, wire)
    return withBends(content, index, wire, moveBendOp(path, k, to))
  })
}

/** Inserts a collinear bend on segment `segment` (0 = start to first bend) at the projection of `point`. */
export function insertBend(wireId: string, segment: number, point: Pt): Command {
  return define((content) => {
    const { index, wire } = wireLocation(content, wireId)
    if (wire.bends.length >= MAX_BENDS_PER_WIRE || totalBends(content) >= MAX_TOTAL_BENDS)
      reject('limit', 'bends')
    const { path } = pathOf(content, wire)
    const bends = insertBendOp(path, segment, point)
    if (!bends) reject('notFound', `segment ${segment}`)
    return withBends(content, index, wire, bends)
  })
}

/** Removes a bend, re-aligning the next one; falls back to the automatic route when no orthogonal join exists. */
export function removeBend(wireId: string, k: number): Command {
  return define((content) => {
    const { index, wire } = wireLocation(content, wireId)
    if (!wire.bends[k]) reject('notFound', `bend ${k}`)
    const { layout, path } = pathOf(content, wire)
    const bends = removeBendOp(path, k) ?? autoRouteFor(layout, wire) ?? []
    if (totalBends(content) - wire.bends.length + bends.length > MAX_TOTAL_BENDS) {
      reject('limit', 'bends')
    }
    return withBends(content, index, wire, bends)
  })
}

/** Discards the user's bends and routes the wire automatically again. */
export function resetRoute(wireId: string): Command {
  return define((content) => {
    const { index, wire } = wireLocation(content, wireId)
    const bends = autoRouteFor(computeLayout(content), wire)
    if (!bends) reject('notFound', wireId)
    return withBends(content, index, wire, bends)
  })
}

/** Switches an element on the schematic: a device on/off, an ATS A to off to B to A. */
export function toggleElement(id: string): Command {
  return define((content) => {
    const { railIndex, rail, index, element } = elementLocation(content, id)
    const next: PanelElement =
      element.kind === 'ats'
        ? { ...element, state: element.state === 'A' ? 'off' : element.state === 'off' ? 'B' : 'A' }
        : { ...element, on: !element.on }
    const elements = rail.elements.map((e, i) => (i === index ? next : e))
    return replaceRail(content, railIndex, { ...rail, elements })
  })
}
