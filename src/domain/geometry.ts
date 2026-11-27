/**
 * Drawing geometry shared with the backend PDF renderer (panel-domain "Drawing geometry").
 * All derived points are integer tenths of a millimetre (u) computed with integer arithmetic only.
 */
import type {
  Bend,
  CableWire,
  ContactSide,
  Endpoint,
  PanelContent,
  PanelWire,
  WireColour,
  WireCrossSection,
} from './panelContent'
import { ATS_INPUTS, ATS_OUTPUTS, MAX_RAIL_WIDTH } from './limits'

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

export interface CableBox {
  id: string
  kind: 'input' | 'output'
  index: number
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
  railIndex: number | null
  x: number
  y: number
  w: number
  h: number
  terminalCount: number
  widthModules: number
}

export interface CableWireSpot {
  pt: Pt
  kind: 'input' | 'output'
  cableId: string
}

export interface Layout {
  rowTop: number
  railsTop: number
  outTop: number
  width: number
  height: number
  inputBoxes: CableBox[]
  outputBoxes: CableBox[]
  rails: RailBox[]
  elements: Map<string, ElementBox>
  blocks: Map<string, BlockBox>
  cableWires: Map<string, CableWireSpot>
}

/** x of terminal `i` of `n` on an item starting at `x0` with `widthModules` (exact rational, half up). */
export function terminalX(x0: number, widthModules: number, i: number, n: number): number {
  return x0 + Math.floor((widthModules * MODULE * (2 * i + 1) + n) / (2 * n))
}

export function cableBoxWidth(wireCount: number): number {
  return 2 * CABLE_PAD + wireCount * CABLE_PITCH
}

// Boxes are reused while the item object and its position are unchanged, so components that
// receive them as props skip re-rendering when something else in the panel changed.
const railBoxes = new WeakMap<object, RailBox>()
const elementBoxes = new WeakMap<object, ElementBox>()
const blockBoxes = new WeakMap<object, BlockBox>()
const cableBoxes = new WeakMap<object, CableBox>()

function cableRow(
  cables: { id: string; wires: CableWire[] }[],
  kind: 'input' | 'output',
  y: number,
  wireY: number,
  spots: Map<string, CableWireSpot>,
): { boxes: CableBox[]; width: number } {
  let x = MARGIN
  const boxes: CableBox[] = []
  cables.forEach((cable, index) => {
    const w = cableBoxWidth(cable.wires.length)
    let box = cableBoxes.get(cable)
    if (!box || box.x !== x || box.y !== y || box.index !== index || box.kind !== kind) {
      const wires = cable.wires.map((wire, i) => ({
        id: wire.id,
        colour: wire.colour,
        pt: { x: x + CABLE_PAD + CABLE_PITCH * i + CABLE_PITCH / 2, y: wireY },
      }))
      box = { id: cable.id, kind, index, x, y, w, h: CABLE_BOX_H, wires }
      cableBoxes.set(cable, box)
    }
    for (const wire of box.wires) spots.set(wire.id, { pt: wire.pt, kind, cableId: cable.id })
    boxes.push(box)
    x += w + CABLE_GAP
  })
  return { boxes, width: boxes.length === 0 ? 0 : x - CABLE_GAP - MARGIN }
}

export function computeLayout(content: PanelContent): Layout {
  const cableWires = new Map<string, CableWireSpot>()
  const input = cableRow(content.inputCables, 'input', MARGIN, MARGIN + CABLE_BOX_H, cableWires)
  const rowTop = MARGIN + CABLE_BOX_H + CABLE_ROW_GAP
  const railsTop = rowTop + ROW_BLOCK_H + CABLE_ROW_GAP

  const rails: RailBox[] = []
  const elements = new Map<string, ElementBox>()
  const blocks = new Map<string, BlockBox>()
  for (const b of content.terminalRow) {
    const cached = blockBoxes.get(b)
    if (cached) {
      blocks.set(b.id, cached)
      continue
    }
    const box: BlockBox = {
      id: b.id,
      railId: null,
      railIndex: null,
      x: MARGIN + b.offsetModules * MODULE,
      y: rowTop,
      w: b.widthModules * MODULE,
      h: ROW_BLOCK_H,
      terminalCount: b.terminalCount,
      widthModules: b.widthModules,
    }
    blockBoxes.set(b, box)
    blocks.set(b.id, box)
  }
  let cy = railsTop
  let widest = 0
  content.rails.forEach((rail, index) => {
    cy += Math.round(rail.spacingMm * 10)
    widest = Math.max(widest, rail.widthModules)
    let railBox = railBoxes.get(rail)
    if (!railBox || railBox.index !== index || railBox.cy !== cy) {
      railBox = {
        id: rail.id,
        index,
        cy,
        x: MARGIN,
        y: cy - RAIL_H / 2,
        w: rail.widthModules * MODULE,
        h: RAIL_H,
      }
      railBoxes.set(rail, railBox)
    }
    rails.push(railBox)
    for (const e of rail.elements) {
      const cached = elementBoxes.get(e)
      if (
        cached &&
        cached.railId === rail.id &&
        cached.railIndex === index &&
        cached.y === cy - ELEMENT_H / 2
      ) {
        elements.set(e.id, cached)
        continue
      }
      const box: ElementBox = {
        id: e.id,
        railId: rail.id,
        railIndex: index,
        x: MARGIN + e.offsetModules * MODULE,
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
      const cached = blockBoxes.get(b)
      if (
        cached &&
        cached.railId === rail.id &&
        cached.railIndex === index &&
        cached.y === cy - ELEMENT_H / 2
      ) {
        blocks.set(b.id, cached)
        continue
      }
      const box: BlockBox = {
        id: b.id,
        railId: rail.id,
        railIndex: index,
        x: MARGIN + b.offsetModules * MODULE,
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

  const last = rails[rails.length - 1]
  const outTop = (last ? last.cy + ELEMENT_H / 2 : railsTop) + CABLE_ROW_GAP
  const output = cableRow(content.outputCables, 'output', outTop, outTop, cableWires)

  const width =
    2 * MARGIN + Math.max(MAX_RAIL_WIDTH * MODULE, widest * MODULE, input.width, output.width)
  return {
    rowTop,
    railsTop,
    outTop,
    width,
    height: outTop + CABLE_BOX_H + MARGIN,
    inputBoxes: input.boxes,
    outputBoxes: output.boxes,
    rails,
    elements,
    blocks,
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
      return spot.kind === 'input' ? 'down' : 'up'
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
