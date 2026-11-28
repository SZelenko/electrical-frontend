/**
 * Drawing geometry shared with the backend PDF renderer (panel-domain "Drawing geometry").
 * All derived points are integer tenths of a millimetre (u) computed with integer arithmetic only.
 */
import {
  ROW_IDS,
  rowBlocks,
  type Bend,
  type CableSide,
  type CableWire,
  type ContactSide,
  type Endpoint,
  type PanelContent,
  type PanelWire,
  type RowId,
  type WireColour,
  type WireCrossSection,
} from './panelContent'
import { busbarCover, railItems } from './busbars'
import { ATS_INPUTS, ATS_OUTPUTS, busbarFeedCount } from './limits'

export type Pt = Bend

export const MODULE = 175
export const MARGIN = 200
export const CABLE_BOX_H = 250
export const CABLE_PAD = 50
export const CABLE_PITCH = 100
export const CABLE_GAP = 100
export const CABLE_ROW_GAP = 150
export const RAIL_H = 350
export const ELEMENT_H = 900
export const ROW_BLOCK_H = 250
export const VBLOCK_PITCH = 75
export const VBLOCK_INSET = 25
export const STUB = 100
export const BUSBAR_H = 60
/** x offsets of the busbar feeds (L, N) from the anchor's left edge. */
export const BUSBAR_FEED_X = [30, 90] as const
/** Horizontal room kept free inside a cable box around the label (total, both sides). */
export const CABLE_LABEL_INSET = 40
/** y offset of rail-block contact 0 below the block top (centres the 12 contacts on the 900 body). */
const VBLOCK_FIRST = 38

export function mmToTenths(mm: number): number {
  return Math.round(mm * 10)
}
export function tenthsToMm(u: number): number {
  return u / 10
}

/** Direction a wire leaves a terminal: away from the device body / cable box. */
export type Direction = 'up' | 'down' | 'left' | 'right'

/** Direction a wire leaves a cable wire point, by the side of its box. */
export const CABLE_WIRE_DIRECTION: Record<CableSide, Direction> = {
  top: 'down',
  bottom: 'up',
  left: 'right',
  right: 'left',
}

export interface CableBox {
  id: string
  kind: 'input' | 'output'
  /** Side of the drawing the box stands on. Left/right boxes are `CABLE_BOX_H` wide and as tall as their wires need. */
  side: CableSide
  /** Index within its own kind (caption number − 1). */
  index: number
  label: string
  x: number
  y: number
  w: number
  h: number
  wires: { id: string; colour: WireColour; pt: Pt }[]
}

export interface RailBox {
  id: string
  index: number
  /** Rail centre line. */
  cy: number
  /** Strip rectangle. */
  x: number
  y: number
  w: number
  h: number
}

export interface ElementBox {
  id: string
  railId: string
  railIndex: number
  x: number
  y: number
  w: number
  h: number
  kind: 'device' | 'ats'
  /** Poles of a device; for an ATS the number of inputs (4), see `outputCount`. */
  poleCount: number
  /** Number of output terminals (ATS 2, a device has `poleCount`). */
  outputCount: number
  sidesSwapped: boolean
}

/** A terminal block on a rail (vertical, `railId` set) or in the terminal row (horizontal, `railId` null). */
export interface BlockBox {
  id: string
  railId: string | null
  /** The terminal row of a row block; null for a rail block. */
  row: RowId | null
  railIndex: number | null
  x: number
  y: number
  w: number
  h: number
  terminalCount: number
  widthModules: number
}

/** A busbar body and its feeds; recomputed with every layout (never cached by the busbar object). */
export interface BusbarBox {
  id: string
  railId: string
  railIndex: number
  type: 'L' | 'LN'
  colour: WireColour | null
  x: number
  y: number
  w: number
  h: number
  /** The anchor's input edge is the bottom one. */
  swapped: boolean
  /** Feed points (index 0 = L, 1 = N) on the outer long edge. */
  feeds: Pt[]
  /** Direction a wire leaves a feed. */
  dir: 'up' | 'down'
  /** Covered items including the anchor, clamped to the items the rail has. */
  coveredCount: number
}

export interface CableWireSpot {
  pt: Pt
  kind: 'input' | 'output'
  side: CableSide
  cableId: string
}

export interface Layout {
  /** x of the rail start: rails, elements, rail blocks, busbars, both terminal rows and the top/bottom cable rows. */
  railsLeft: number
  /** y of the top terminal row band (x = `railsLeft`, width = rail width, height `ROW_BLOCK_H`). */
  topRowY: number
  railsTop: number
  railWidthModules: number
  /** y of the top edge of the bottom cable row (also defined when that side is empty). */
  outTop: number
  /** y of the bottom terminal row band. */
  bottomRowY: number
  width: number
  height: number
  /** Every cable box, each on its own side. */
  cableBoxes: CableBox[]
  inputBoxes: CableBox[]
  outputBoxes: CableBox[]
  rails: RailBox[]
  elements: Map<string, ElementBox>
  blocks: Map<string, BlockBox>
  busbars: Map<string, BusbarBox>
  cableWires: Map<string, CableWireSpot>
}

/** x of terminal `i` of `n` on an item starting at `x0` with `widthModules` (exact rational, half up). */
export function terminalX(x0: number, widthModules: number, i: number, n: number): number {
  return x0 + Math.floor((widthModules * MODULE * (2 * i + 1) + n) / (2 * n))
}

/** Length of a cable box along its side (width for top/bottom, height for left/right boxes). */
export function cableBoxWidth(wireCount: number): number {
  return 2 * CABLE_PAD + wireCount * CABLE_PITCH
}

/** Length of a row/column of cable boxes with the given wire counts (0 when empty). */
function cablesLength(wireCounts: readonly number[]): number {
  if (wireCounts.length === 0) return 0
  return (
    wireCounts.reduce((sum, n) => sum + cableBoxWidth(n), 0) + (wireCounts.length - 1) * CABLE_GAP
  )
}

/** Modules available to the blocks of a terminal row: the rail width (cables never limit a row). */
export function rowCapacity(content: Pick<PanelContent, 'railWidthModules'>): number {
  return content.railWidthModules
}

/** Baselines of the caption and the label inside a cable box, measured from the box top (top/bottom) or left edge (left/right). */
export function cableTextOffsets(side: CableSide): { caption: number; label: number } {
  return side === 'top' || side === 'left'
    ? { caption: 80, label: 130 }
    : { caption: 190, label: 140 }
}

// Boxes are reused while the item object and its position are unchanged, so components that
// receive them as props skip re-rendering when something else in the panel changed.
const railBoxes = new WeakMap<object, RailBox>()
const elementBoxes = new WeakMap<object, ElementBox>()
const blockBoxes = new WeakMap<object, BlockBox>()
const cableBoxes = new WeakMap<object, CableBox>()

interface CableItem {
  cable: { id: string; label: string; wires: CableWire[] }
  kind: 'input' | 'output'
  index: number
}

/** Cables of a side: the input cables (in order) when they are on it, then the output cables (in order). */
function cablesOnSide(content: PanelContent, side: CableSide): CableItem[] {
  const items: CableItem[] = []
  if (content.inputCableSide === side) {
    content.inputCables.forEach((cable, index) => items.push({ cable, kind: 'input', index }))
  }
  if (content.outputCableSide === side) {
    content.outputCables.forEach((cable, index) => items.push({ cable, kind: 'output', index }))
  }
  return items
}

/**
 * Boxes of one side in list order, from `(x0, y0)` along the row (top/bottom) or column
 * (left/right). `x0`/`y0` is the box origin of the first box; wire points sit on the edge facing
 * the drawing.
 */
function placeCables(
  items: readonly CableItem[],
  side: CableSide,
  x0: number,
  y0: number,
  spots: Map<string, CableWireSpot>,
): CableBox[] {
  const horizontal = side === 'top' || side === 'bottom'
  let pos = horizontal ? x0 : y0
  return items.map(({ cable, kind, index }) => {
    const len = cableBoxWidth(cable.wires.length)
    const x = horizontal ? pos : x0
    const y = horizontal ? y0 : pos
    let box = cableBoxes.get(cable)
    if (
      !box ||
      box.x !== x ||
      box.y !== y ||
      box.index !== index ||
      box.kind !== kind ||
      box.side !== side ||
      box.label !== cable.label
    ) {
      const edgeX = side === 'left' ? x + CABLE_BOX_H : x
      const edgeY = side === 'top' ? y + CABLE_BOX_H : y
      const wires = cable.wires.map((wire, i) => {
        const along = CABLE_PAD + CABLE_PITCH * i + CABLE_PITCH / 2
        return {
          id: wire.id,
          colour: wire.colour,
          pt: horizontal ? { x: x + along, y: edgeY } : { x: edgeX, y: y + along },
        }
      })
      box = {
        id: cable.id,
        kind,
        side,
        index,
        label: cable.label,
        x,
        y,
        w: horizontal ? len : CABLE_BOX_H,
        h: horizontal ? CABLE_BOX_H : len,
        wires,
      }
      cableBoxes.set(cable, box)
    }
    for (const wire of box.wires) spots.set(wire.id, { pt: wire.pt, kind, side, cableId: cable.id })
    pos += len + CABLE_GAP
    return box
  })
}

export function computeLayout(content: PanelContent): Layout {
  const cableWires = new Map<string, CableWireSpot>()
  const railW = content.railWidthModules
  const sides = {
    top: cablesOnSide(content, 'top'),
    bottom: cablesOnSide(content, 'bottom'),
    left: cablesOnSide(content, 'left'),
    right: cablesOnSide(content, 'right'),
  }

  const railsLeft = MARGIN + (sides.left.length > 0 ? CABLE_BOX_H + CABLE_ROW_GAP : 0)
  const railsRight = railsLeft + railW * MODULE
  const topBoxes = placeCables(sides.top, 'top', railsLeft, MARGIN, cableWires)
  const topRowY = sides.top.length > 0 ? MARGIN + CABLE_BOX_H + CABLE_ROW_GAP : MARGIN
  const railsTop = topRowY + ROW_BLOCK_H + CABLE_ROW_GAP
  const leftBoxes = placeCables(sides.left, 'left', MARGIN, railsTop, cableWires)
  const rightBoxes = placeCables(
    sides.right,
    'right',
    railsRight + CABLE_ROW_GAP,
    railsTop,
    cableWires,
  )

  const rails: RailBox[] = []
  const elements = new Map<string, ElementBox>()
  const blocks = new Map<string, BlockBox>()
  let cy = railsTop
  content.rails.forEach((rail, index) => {
    cy += Math.round(rail.spacingMm * 10)
    let railBox = railBoxes.get(rail)
    if (
      !railBox ||
      railBox.index !== index ||
      railBox.cy !== cy ||
      railBox.x !== railsLeft ||
      railBox.w !== railW * MODULE
    ) {
      railBox = {
        id: rail.id,
        index,
        cy,
        x: railsLeft,
        y: cy - RAIL_H / 2,
        w: railW * MODULE,
        h: RAIL_H,
      }
      railBoxes.set(rail, railBox)
    }
    rails.push(railBox)
    for (const e of rail.elements) {
      const x = railsLeft + e.offsetModules * MODULE
      const cached = elementBoxes.get(e)
      if (
        cached &&
        cached.railId === rail.id &&
        cached.railIndex === index &&
        cached.x === x &&
        cached.y === cy - ELEMENT_H / 2
      ) {
        elements.set(e.id, cached)
        continue
      }
      const box: ElementBox = {
        id: e.id,
        railId: rail.id,
        railIndex: index,
        x,
        y: cy - ELEMENT_H / 2,
        w: e.widthModules * MODULE,
        h: ELEMENT_H,
        kind: e.kind,
        poleCount: e.kind === 'ats' ? ATS_INPUTS : e.poles.length,
        outputCount: e.kind === 'ats' ? ATS_OUTPUTS : e.poles.length,
        sidesSwapped: e.sidesSwapped,
      }
      elementBoxes.set(e, box)
      elements.set(e.id, box)
    }
    for (const b of rail.terminalBlocks) {
      const x = railsLeft + b.offsetModules * MODULE
      const cached = blockBoxes.get(b)
      if (
        cached &&
        cached.railId === rail.id &&
        cached.railIndex === index &&
        cached.x === x &&
        cached.y === cy - ELEMENT_H / 2
      ) {
        blocks.set(b.id, cached)
        continue
      }
      const box: BlockBox = {
        id: b.id,
        railId: rail.id,
        row: null,
        railIndex: index,
        x,
        y: cy - ELEMENT_H / 2,
        w: MODULE,
        h: ELEMENT_H,
        terminalCount: b.terminalCount,
        widthModules: 1,
      }
      blockBoxes.set(b, box)
      blocks.set(b.id, box)
    }
  })

  const busbars = new Map<string, BusbarBox>()
  content.rails.forEach((rail, index) => {
    if (rail.busbars.length === 0) return
    const items = railItems(rail)
    for (const busbar of rail.busbars) {
      const cover = busbarCover(rail, busbar, items)
      const anchor = elements.get(busbar.firstElementId)
      const lastItem = cover?.items[cover.items.length - 1]
      if (!cover || !anchor || !lastItem || anchor.railIndex !== index) continue
      const feedCount = busbarFeedCount(busbar.type)
      const edge = anchor.sidesSwapped ? anchor.y + anchor.h : anchor.y
      const outer = anchor.sidesSwapped ? edge + BUSBAR_H : edge - BUSBAR_H
      busbars.set(busbar.id, {
        id: busbar.id,
        railId: rail.id,
        railIndex: index,
        type: busbar.type,
        colour: busbar.colour,
        x: anchor.x,
        y: anchor.sidesSwapped ? edge : outer,
        w: railsLeft + (lastItem.offset + lastItem.width) * MODULE - anchor.x,
        h: BUSBAR_H,
        swapped: anchor.sidesSwapped,
        feeds: BUSBAR_FEED_X.slice(0, feedCount).map((dx) => ({ x: anchor.x + dx, y: outer })),
        dir: anchor.sidesSwapped ? 'down' : 'up',
        coveredCount: cover.items.length,
      })
    }
  })

  const lastRail = rails[rails.length - 1]
  const sideBottom = Math.max(
    lastRail ? lastRail.cy + ELEMENT_H / 2 : railsTop,
    railsTop + cablesLength(sides.left.map((i) => i.cable.wires.length)),
    railsTop + cablesLength(sides.right.map((i) => i.cable.wires.length)),
  )
  const outTop = sideBottom + CABLE_ROW_GAP
  const bottomBoxes = placeCables(sides.bottom, 'bottom', railsLeft, outTop, cableWires)
  const bottomRowY = sides.bottom.length > 0 ? outTop + CABLE_BOX_H + CABLE_ROW_GAP : outTop

  const rowYs: Record<RowId, number> = { top: topRowY, bottom: bottomRowY }
  for (const row of ROW_IDS) {
    const y = rowYs[row]
    for (const b of rowBlocks(content, row)) {
      const x = railsLeft + b.offsetModules * MODULE
      const cached = blockBoxes.get(b)
      if (cached && cached.row === row && cached.x === x && cached.y === y) {
        blocks.set(b.id, cached)
        continue
      }
      const box: BlockBox = {
        id: b.id,
        railId: null,
        row,
        railIndex: null,
        x,
        y,
        w: b.widthModules * MODULE,
        h: ROW_BLOCK_H,
        terminalCount: b.terminalCount,
        widthModules: b.widthModules,
      }
      blockBoxes.set(b, box)
      blocks.set(b.id, box)
    }
  }

  const rowLength = (list: readonly CableItem[]) =>
    cablesLength(list.map((i) => i.cable.wires.length))
  const width =
    MARGIN +
    Math.max(
      railsRight + (sides.right.length > 0 ? CABLE_ROW_GAP + CABLE_BOX_H : 0),
      railsLeft + rowLength(sides.top),
      railsLeft + rowLength(sides.bottom),
    )
  const all = [...topBoxes, ...leftBoxes, ...rightBoxes, ...bottomBoxes]
  return {
    railsLeft,
    topRowY,
    railsTop,
    railWidthModules: railW,
    outTop,
    bottomRowY,
    width,
    height: bottomRowY + ROW_BLOCK_H + MARGIN,
    cableBoxes: all,
    inputBoxes: all.filter((b) => b.kind === 'input'),
    outputBoxes: all.filter((b) => b.kind === 'output'),
    rails,
    elements,
    blocks,
    busbars,
    cableWires,
  }
}

/** Y of rail-block contact `k` (0 = top). */
export function railContactY(box: BlockBox, k: number): number {
  return box.y + VBLOCK_PITCH * k + VBLOCK_FIRST
}

/** True when the contact side belongs to the kind of block (row: top/bottom, rail: left/right). */
export function sideFitsBlock(box: BlockBox, side: ContactSide): boolean {
  return box.railId === null
    ? side === 'top' || side === 'bottom'
    : side === 'left' || side === 'right'
}

/** Point of an endpoint, or null when the element/block/cable wire (or the index or side) does not exist. */
export function endpointPoint(layout: Layout, e: Endpoint): Pt | null {
  switch (e.kind) {
    case 'pole': {
      const box = layout.elements.get(e.elementId)
      if (!box || e.poleIndex < 0) return null
      const count = e.side === 'input' ? box.poleCount : box.outputCount
      if (e.poleIndex >= count) return null
      const x = terminalX(box.x, box.w / MODULE, e.poleIndex, count)
      const top = e.side === 'input' ? !box.sidesSwapped : box.sidesSwapped
      return { x, y: top ? box.y : box.y + box.h }
    }
    case 'terminal': {
      const box = layout.blocks.get(e.terminalBlockId)
      if (!box || e.terminalIndex < 0 || e.terminalIndex >= box.terminalCount) return null
      if (!sideFitsBlock(box, e.contactSide)) return null
      if (box.railId === null) {
        return {
          x: terminalX(box.x, box.widthModules, e.terminalIndex, box.terminalCount),
          y: e.contactSide === 'top' ? box.y : box.y + box.h,
        }
      }
      return {
        x: e.contactSide === 'left' ? box.x + VBLOCK_INSET : box.x + MODULE - VBLOCK_INSET,
        y: railContactY(box, e.terminalIndex),
      }
    }
    case 'cableWire':
      return layout.cableWires.get(e.cableWireId)?.pt ?? null
    case 'busbar':
      return layout.busbars.get(e.busbarId)?.feeds[e.feedIndex] ?? null
  }
}

/** Direction a wire leaves the endpoint (away from the body), or null for an unknown endpoint. */
export function endpointDirection(layout: Layout, e: Endpoint): Direction | null {
  switch (e.kind) {
    case 'pole': {
      const box = layout.elements.get(e.elementId)
      if (!box) return null
      const top = e.side === 'input' ? !box.sidesSwapped : box.sidesSwapped
      return top ? 'up' : 'down'
    }
    case 'terminal': {
      const box = layout.blocks.get(e.terminalBlockId)
      if (!box || !sideFitsBlock(box, e.contactSide)) return null
      return e.contactSide === 'top' ? 'up' : e.contactSide === 'bottom' ? 'down' : e.contactSide
    }
    case 'cableWire': {
      const spot = layout.cableWires.get(e.cableWireId)
      if (!spot) return null
      return CABLE_WIRE_DIRECTION[spot.side]
    }
    case 'busbar': {
      const box = layout.busbars.get(e.busbarId)
      return box && box.feeds[e.feedIndex] ? box.dir : null
    }
  }
}

/** The polyline drawn for a wire: start, bends verbatim, end; null when an endpoint is unknown. */
export function wirePolyline(layout: Layout, wire: PanelWire): Pt[] | null {
  const start = endpointPoint(layout, wire.start)
  const end = endpointPoint(layout, wire.end)
  if (!start || !end) return null
  return [start, ...wire.bends, end]
}

/** Bounding box of the drawing extended by bends that lie outside it. */
export function viewBounds(layout: Layout, wires: readonly PanelWire[]) {
  let minX = 0
  let minY = 0
  let maxX = layout.width
  let maxY = layout.height
  for (const w of wires) {
    for (const b of w.bends) {
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x)
      maxY = Math.max(maxY, b.y)
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Wire stroke width in mm of the drawing by cross-section. */
export const WIRE_STROKE_MM: Record<WireCrossSection, number> = {
  '1': 1.3,
  '1.5': 1.3,
  '2.5': 1.5,
  '4': 1.8,
  '6': 2.2,
}

export const WIRE_COLOUR_HEX: Record<WireColour, string> = {
  black: '#1a1a1a',
  brown: '#7b4a1e',
  red: '#d32f2f',
  blue: '#1e5bd6',
  'green-yellow': '#2e9d3a',
}

/** Fill of a grey (colourless) terminal block. */
export const BLOCK_GREY_HEX = '#cfd4dc'

/** Overlay of the green-yellow wire: same width, dashed (mm). */
export const GREEN_YELLOW_OVERLAY = { stroke: '#f2c200', dasharray: '3 3' } as const

export const SHORT_CIRCUIT_HIGHLIGHT = {
  colour: '#ff00ff',
  opacity: 0.5,
  /** Halo width = wire width + this (mm). */
  extraWidthMm: 2,
} as const

export function haloWidthMm(crossSection: WireCrossSection): number {
  return WIRE_STROKE_MM[crossSection] + SHORT_CIRCUIT_HIGHLIGHT.extraWidthMm
}

/** Maximum corner radius of a drawn wire: 3 mm. */
export const CORNER_RADIUS = 30

/**
 * SVG path data (tenths of mm) of a wire polyline with rounded corners (drawing only; the stored
 * bends are unchanged). At every turn the corner is replaced by a circular arc of radius
 * `min(3 mm, half the incoming segment, half the outgoing segment)`. Collinear points, reversals
 * and zero-length segments get no arc. Mirrored by the PDF renderer.
 */
export function roundedPath(points: readonly Pt[]): string {
  const pts = points.filter(
    (p, i) => i === 0 || p.x !== (points[i - 1] as Pt).x || p.y !== (points[i - 1] as Pt).y,
  )
  const first = pts[0]
  if (!first) return ''
  let d = `M${first.x} ${first.y}`
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i] as Pt
    const prev = pts[i - 1] as Pt
    const next = pts[i + 1]
    if (!next) {
      d += ` L${cur.x} ${cur.y}`
      break
    }
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y)
    const inX = (cur.x - prev.x) / inLen
    const inY = (cur.y - prev.y) / inLen
    const outX = (next.x - cur.x) / outLen
    const outY = (next.y - cur.y) / outLen
    const cross = inX * outY - inY * outX
    if (Math.abs(cross) < 1e-9) {
      d += ` L${cur.x} ${cur.y}`
      continue
    }
    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2)
    const a = { x: cur.x - r * inX, y: cur.y - r * inY }
    const b = { x: cur.x + r * outX, y: cur.y + r * outY }
    d += ` L${a.x} ${a.y} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${b.x} ${b.y}`
  }
  return d
}
