/** Automatic orthogonal route between two terminals (editor only): stub, horizontal channel, stub. */
import {
  CABLE_GAP,
  CABLE_LINE_GAP,
  CABLE_WIRE_DIRECTION,
  SHEET_INSET,
  STUB,
  type CableBox,
  type Direction,
  type Layout,
  type Pt,
} from './geometry'

export function samePt(a: Pt, b: Pt): boolean {
  return a.x === b.x && a.y === b.y
}

export function routeEquals(a: readonly Pt[], b: readonly Pt[]): boolean {
  return a.length === b.length && a.every((p, i) => samePt(p, b[i] as Pt))
}

/** Removes duplicate and collinear points; start and end are kept out of the result. */
export function simplifyRoute(start: Pt, bends: readonly Pt[], end: Pt): Pt[] {
  const all = [start, ...bends, end]
  const out: Pt[] = [start]
  for (let i = 1; i < all.length - 1; i++) {
    const prev = out[out.length - 1] as Pt
    const cur = all[i] as Pt
    const next = all[i + 1] as Pt
    if (samePt(prev, cur)) continue
    // A collinear middle point is dropped only when the direction is kept; a backtrack stays.
    const straightX =
      prev.x === cur.x && cur.x === next.x && (cur.y - prev.y) * (next.y - cur.y) >= 0
    const straightY =
      prev.y === cur.y && cur.y === next.y && (cur.x - prev.x) * (next.x - cur.x) >= 0
    if (straightX || straightY) continue
    out.push(cur)
  }
  return out.slice(1)
}

const isVertical = (d: Direction) => d === 'up' || d === 'down'

function transpose(p: Pt): Pt {
  return { x: p.y, y: p.x }
}
const TRANSPOSED: Record<Direction, Direction> = {
  left: 'up',
  right: 'down',
  up: 'left',
  down: 'right',
}

/** Both ends leave vertically: stub, horizontal channel, stub. */
function routeVertical(start: Pt, startDir: Direction, end: Pt, endDir: Direction): Pt[] {
  const ds = startDir === 'down' ? 1 : -1
  const de = endDir === 'down' ? 1 : -1
  const s1y = start.y + ds * STUB
  const e1y = end.y + de * STUB

  // The channel must not run back through a stub: y >= s1y when leaving down, y <= s1y when up.
  let lo = -Infinity
  let hi = Infinity
  if (ds === 1) lo = Math.max(lo, s1y)
  else hi = Math.min(hi, s1y)
  if (de === 1) lo = Math.max(lo, e1y)
  else hi = Math.min(hi, e1y)

  if (lo <= hi) {
    const y =
      Number.isFinite(lo) && Number.isFinite(hi)
        ? Math.round((lo + hi) / 2)
        : Number.isFinite(lo)
          ? lo
          : hi
    return simplifyRoute(
      start,
      [
        { x: start.x, y },
        { x: end.x, y },
      ],
      end,
    )
  }
  let xm = Math.round((start.x + end.x) / 2)
  if (xm === start.x || xm === end.x) xm = Math.max(start.x, end.x) + 2 * STUB
  return simplifyRoute(
    start,
    [
      { x: start.x, y: s1y },
      { x: xm, y: s1y },
      { x: xm, y: e1y },
      { x: end.x, y: e1y },
    ],
    end,
  )
}

/** `start` leaves vertically (`vDir`), `end` is entered horizontally from `hDir` (left or right). */
function routeMixed(start: Pt, vDir: Direction, end: Pt, hDir: Direction): Pt[] {
  const dv = vDir === 'down' ? 1 : -1
  const dh = hDir === 'right' ? 1 : -1
  // One elbow: straight along the stub direction, then into the contact from its open side.
  if ((end.y - start.y) * dv >= STUB && (start.x - end.x) * dh >= STUB) {
    return simplifyRoute(start, [{ x: start.x, y: end.y }], end)
  }
  const s1y = start.y + dv * STUB
  const e1x = end.x + dh * STUB
  return simplifyRoute(
    start,
    [
      { x: start.x, y: s1y },
      { x: e1x, y: s1y },
      { x: e1x, y: end.y },
    ],
    end,
  )
}

/**
 * Route from `start` (leaving in `startDir`) to `end` (entered from `endDir`): at most 4 bends,
 * no obstacle avoidance. Returns the bends only.
 */
export function autoRoute(start: Pt, startDir: Direction, end: Pt, endDir: Direction): Pt[] {
  const sv = isVertical(startDir)
  const ev = isVertical(endDir)
  if (sv && ev) return routeVertical(start, startDir, end, endDir)
  if (!sv && !ev) {
    return routeVertical(
      transpose(start),
      TRANSPOSED[startDir],
      transpose(end),
      TRANSPOSED[endDir],
    ).map(transpose)
  }
  if (sv) return routeMixed(start, startDir, end, endDir)
  return routeMixed(end, endDir, start, startDir).reverse()
}

interface LineGeometry {
  /** Depth range (towards the rails) and along-side range of the boxes of one line. */
  d0: number
  d1: number
  /** Sorted along-side ranges of the boxes. */
  spans: { a0: number; a1: number }[]
}

/**
 * The along-side coordinate at which a wire may cross the line: the wire's own coordinate when it
 * already has room in a gap (a quarter of `CABLE_GAP`, 25 u, clear on both sides; the clearance is
 * this implementation's choice, the contract only says "nearest gap"), otherwise the centre of
 * the nearest gap between the boxes, or half a gap before the first / past the last box.
 */
function crossingAlong(spans: LineGeometry['spans'], along: number): number {
  const clear = CABLE_GAP / 4
  const first = spans[0]
  const last = spans[spans.length - 1]
  if (!first || !last) return along
  // half a gap before the first box, unless that would run along the sheet border (inputs start at SHEET_INSET)
  const candidates = first.a0 - CABLE_GAP / 2 >= SHEET_INSET ? [first.a0 - CABLE_GAP / 2] : []
  const free: { lo: number; hi: number }[] = [{ lo: -Infinity, hi: first.a0 }]
  for (let i = 0; i + 1 < spans.length; i++) {
    const lo = (spans[i] as { a1: number }).a1
    const hi = (spans[i + 1] as { a0: number }).a0
    candidates.push(Math.floor((lo + hi) / 2))
    free.push({ lo, hi })
  }
  candidates.push(last.a1 + CABLE_GAP / 2)
  free.push({ lo: last.a1, hi: Infinity })
  if (
    free.some((f) =>
      f.lo === -Infinity
        ? along <= f.hi - clear
        : f.hi === Infinity
          ? along >= f.lo + clear
          : along >= f.lo + clear && along <= f.hi - clear,
    )
  ) {
    return along
  }
  let best = candidates[0] as number // never empty: the past-the-last candidate is always there
  for (const c of candidates) if (Math.abs(c - along) < Math.abs(best - along)) best = c
  return best
}

/**
 * Wrapped cable lines (panel-domain "Wrapped cable lines"): the points a wire runs through, from the
 * cable wire point outwards, to cross the inner lines of its cable side (inputs and outputs alike).
 * It first runs towards the rails into the gap in front of its own line, then through a gap of each
 * inner line, and ends on the far edge of the innermost line (the point the usual auto-route
 * continues from). Empty when no inner line exists.
 */
export function cableLead(layout: Layout, cableWireId: string): Pt[] {
  const spot = layout.cableWires.get(cableWireId)
  if (!spot) return []
  const own = layout.cableBoxes.find((b) => b.id === spot.cableId)
  if (!own) return []
  // the inner lines are the higher lines of the same side (inputs and outputs alike)
  const inner = layout.cableBoxes.filter((b: CableBox) => b.side === own.side && b.line > own.line)
  if (inner.length === 0) return []
  const dir = CABLE_WIRE_DIRECTION[own.side]
  const horizontal = own.side === 'top' || own.side === 'bottom'
  const sign = dir === 'down' || dir === 'right' ? 1 : -1
  const depthOf = (p: Pt) => (horizontal ? p.y : p.x)
  const toPt = (along: number, depth: number): Pt =>
    horizontal ? { x: along, y: depth } : { x: depth, y: along }

  const byLine = new Map<number, LineGeometry>()
  for (const b of inner) {
    const g = byLine.get(b.line) ?? {
      d0: horizontal ? b.y : b.x,
      d1: horizontal ? b.y + b.h : b.x + b.w,
      spans: [],
    }
    g.spans.push(horizontal ? { a0: b.x, a1: b.x + b.w } : { a0: b.y, a1: b.y + b.h })
    byLine.set(b.line, g)
  }
  const lines = [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g)
  for (const g of lines) g.spans.sort((a, b) => a.a0 - b.a0)

  let along = horizontal ? spot.pt.x : spot.pt.y
  let channel = depthOf(spot.pt) + (sign * CABLE_LINE_GAP) / 2
  const out: Pt[] = [toPt(along, channel)]
  lines.forEach((g, i) => {
    along = crossingAlong(g.spans, along)
    out.push(toPt(along, channel))
    const far = sign > 0 ? g.d1 : g.d0
    if (i === lines.length - 1) {
      out.push(toPt(along, far))
    } else {
      channel = far + (sign * CABLE_LINE_GAP) / 2
      out.push(toPt(along, channel))
    }
  })
  // a straight pass (no sideways jog) repeats a point
  return out.filter((p, i) => i === 0 || !samePt(p, out[i - 1] as Pt))
}
