/** Wire route maintenance: repair after endpoints moved (E3) and bend editing operations (E5). */
import { autoRoute, routeEquals, samePt, simplifyRoute } from './autoRoute'
import {
  computeLayout,
  endpointDirection,
  endpointPoint,
  type Direction,
  type Layout,
  type Pt,
} from './geometry'
import { MAX_BENDS_PER_WIRE, MAX_COORD_U } from './limits'
import type { PanelContent, PanelWire } from './panelContent'

function clampCoord(v: number): number {
  return Math.min(MAX_COORD_U, Math.max(0, Math.round(v)))
}
function inRange(p: Pt): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= MAX_COORD_U && p.y <= MAX_COORD_U
}
function clampPt(p: Pt): Pt {
  return { x: clampCoord(p.x), y: clampCoord(p.y) }
}

interface Ends {
  start: Pt
  end: Pt
  startDir: Direction
  endDir: Direction
}

function endsOf(layout: Layout, wire: Pick<PanelWire, 'start' | 'end'>): Ends | null {
  const start = endpointPoint(layout, wire.start)
  const end = endpointPoint(layout, wire.end)
  const startDir = endpointDirection(layout, wire.start)
  const endDir = endpointDirection(layout, wire.end)
  if (!start || !end || !startDir || !endDir) return null
  return { start, end, startDir, endDir }
}

/** The automatic route of a wire in the given layout (bends only), or null for unknown endpoints. */
export function autoRouteFor(layout: Layout, wire: Pick<PanelWire, 'start' | 'end'>): Pt[] | null {
  const e = endsOf(layout, wire)
  return e ? autoRoute(e.start, e.startDir, e.end, e.endDir) : null
}

type Axis = 'h' | 'v'
function axisOf(a: Pt, b: Pt): Axis | null {
  if (a.x === b.x && a.y !== b.y) return 'v'
  if (a.y === b.y && a.x !== b.x) return 'h'
  return null
}

/** Re-anchors the end segments of a user route after its endpoints moved; null when it cannot. */
function reanchor(old: Ends, now: Ends, bends: readonly Pt[]): Pt[] | null {
  if (bends.length === 0) return null
  const b = bends.map((p) => ({ ...p }))
  const touched = b.map(() => false)
  const first = bends[0] as Pt
  const last = bends[bends.length - 1] as Pt
  const startAxis = axisOf(old.start, first)
  const endAxis = axisOf(old.end, last)
  if (!startAxis || !endAxis) return null

  // Start side. `startAxis` is the orientation of the first segment.
  {
    const b0 = b[0] as Pt
    const aligned = startAxis === 'v' ? now.start.x === b0.x : now.start.y === b0.y
    if (!aligned) {
      const next = b.length > 1 ? (b[1] as Pt) : now.end
      const nextAxis = axisOf(b0, next)
      if (nextAxis !== null && nextAxis !== startAxis) {
        if (startAxis === 'v') b0.x = now.start.x
        else b0.y = now.start.y
        touched[0] = true
      } else {
        const elbow = startAxis === 'v' ? { x: now.start.x, y: b0.y } : { x: b0.x, y: now.start.y }
        b.unshift(elbow)
        touched.unshift(true)
      }
    }
  }
  // End side.
  {
    const i = b.length - 1
    const bl = b[i] as Pt
    const aligned = endAxis === 'v' ? now.end.x === bl.x : now.end.y === bl.y
    if (!aligned) {
      const prev = i > 0 ? (b[i - 1] as Pt) : now.start
      const prevAxis = axisOf(prev, bl)
      if (prevAxis !== null && prevAxis !== endAxis) {
        if (endAxis === 'v') bl.x = now.end.x
        else bl.y = now.end.y
        touched[i] = true
      } else {
        const elbow = endAxis === 'v' ? { x: now.end.x, y: bl.y } : { x: bl.x, y: now.end.y }
        b.push(elbow)
        touched.push(true)
      }
    }
  }
  // Normalise only the points this repair created or changed.
  const all = [now.start, ...b, now.end]
  const keep: Pt[] = []
  for (let i = 0; i < b.length; i++) {
    const prev = (keep[keep.length - 1] ?? all[0]) as Pt
    const cur = b[i] as Pt
    const next = (i + 1 < b.length ? b[i + 1] : now.end) as Pt
    if (touched[i]) {
      if (samePt(prev, cur)) continue
      if ((prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y)) continue
    }
    keep.push(cur)
  }
  if (keep.length > MAX_BENDS_PER_WIRE || keep.some((p) => !inRange(p))) return null
  return keep
}

function repairWire(oldE: Ends, newE: Ends, bends: readonly Pt[]): Pt[] {
  const dsx = newE.start.x - oldE.start.x
  const dsy = newE.start.y - oldE.start.y
  const dex = newE.end.x - oldE.end.x
  const dey = newE.end.y - oldE.end.y
  // (a) both ends moved by the same delta
  if (dsx === dex && dsy === dey) {
    const moved = bends.map((p) => ({ x: p.x + dsx, y: p.y + dsy }))
    // never clamp (that could skew a segment): out-of-range routes are drawn again
    if (moved.every(inRange)) return moved
    return autoRoute(newE.start, newE.startDir, newE.end, newE.endDir)
  }
  const fresh = () => autoRoute(newE.start, newE.startDir, newE.end, newE.endDir)
  // (b) the route was the automatic one
  if (routeEquals(bends, autoRoute(oldE.start, oldE.startDir, oldE.end, oldE.endDir))) {
    return fresh()
  }
  // (c) keep the user's bends, re-anchor the end segments
  return reanchor(oldE, newE, bends) ?? fresh()
}

/**
 * Repairs the routes of wires whose endpoints moved between `before` and `after` (same wires, same
 * ids). Only wires in `wireIds` (when given) are considered. Returns `after` itself when nothing changed.
 */
export function repairRoutes(
  before: PanelContent,
  after: PanelContent,
  wireIds?: ReadonlySet<string>,
): PanelContent {
  if (before === after && !wireIds) return after
  const layoutBefore = computeLayout(before)
  const layoutAfter = computeLayout(after)
  const oldById = new Map(before.wires.map((w) => [w.id, w]))
  let changed = false
  const wires = after.wires.map((wire) => {
    if (wireIds && !wireIds.has(wire.id)) return wire
    const old = oldById.get(wire.id)
    if (!old) return wire
    const oldE = endsOf(layoutBefore, old)
    const newE = endsOf(layoutAfter, wire)
    if (!oldE || !newE) return wire
    if (
      samePt(oldE.start, newE.start) &&
      samePt(oldE.end, newE.end) &&
      oldE.startDir === newE.startDir &&
      oldE.endDir === newE.endDir
    ) {
      return wire
    }
    const bends = repairWire(oldE, newE, old.bends)
    if (routeEquals(bends, wire.bends)) return wire
    changed = true
    return { ...wire, bends }
  })
  return changed ? { ...after, wires } : after
}

// ---- bend editing (E5) ----

export interface WirePath {
  start: Pt
  end: Pt
  bends: readonly Pt[]
}

/**
 * Moves bend `k` to `to`. The shared coordinate of the neighbouring points follows (y of a
 * horizontal segment, x of a vertical one); terminal neighbours never move, so the bend's axis is
 * locked against them. Coordinates are clamped to the drawing grid.
 */
export function moveBend(path: WirePath, k: number, to: Pt): Pt[] {
  const pts = [path.start, ...path.bends, path.end].map((p) => ({ ...p }))
  const i = k + 1
  const p = pts[i]
  if (!p) return [...path.bends]
  const lastIdx = pts.length - 1
  const orig = [path.start, ...path.bends, path.end]
  let { x, y } = clampPt(to)
  for (const j of [i - 1, i + 1]) {
    const n = pts[j] as Pt
    const axis = axisOf(orig[i] as Pt, orig[j] as Pt)
    if (!axis) continue
    const terminal = j === 0 || j === lastIdx
    if (terminal) {
      if (axis === 'h') y = n.y
      else x = n.x
    }
  }
  p.x = x
  p.y = y
  for (const j of [i - 1, i + 1]) {
    if (j === 0 || j === lastIdx) continue
    const n = pts[j] as Pt
    const axis = axisOf(orig[i] as Pt, orig[j] as Pt)
    if (axis === 'h') n.y = y
    else if (axis === 'v') n.x = x
  }
  return pts.slice(1, lastIdx)
}

function isOrthogonal(a: Pt, b: Pt): boolean {
  return a.x === b.x || a.y === b.y
}

/**
 * Removes bend `k` and re-aligns the following bends so no diagonal appears. Returns null when the
 * remaining terminals cannot be joined orthogonally (the caller then falls back to the auto route).
 */
export function removeBend(path: WirePath, k: number): Pt[] | null {
  const pts = [path.start, ...path.bends, path.end].map((p) => ({ ...p }))
  const i = k + 1
  if (i < 1 || i >= pts.length - 1) return null
  const prevAxis = axisOf(pts[i - 1] as Pt, pts[i] as Pt)
  pts.splice(i, 1)
  const last = pts.length - 1
  const prev = pts[i - 1] as Pt
  const next = pts[i] as Pt
  if (!isOrthogonal(prev, next)) {
    if (i < last) {
      // the segment prev -> removed bend kept its orientation: the next bend takes the shared coordinate
      if (prevAxis === 'h') next.y = prev.y
      else next.x = prev.x
    } else if (i - 1 > 0) {
      // the next point is the end terminal: move the previous bend onto its line instead
      if (prevAxis === 'h') prev.y = next.y
      else prev.x = next.x
    }
  }
  // Propagate: later bends follow the alternating orientation; a terminal cannot move.
  for (let j = 1; j <= last; j++) {
    const a = pts[j - 1] as Pt
    const b = pts[j] as Pt
    if (isOrthogonal(a, b)) continue
    if (j === last || j < 2) return null
    const before = axisOf(pts[j - 2] as Pt, a)
    if (before === 'h') b.x = a.x
    else if (before === 'v') b.y = a.y
    else return null
  }
  for (let j = 1; j <= last; j++) if (!isOrthogonal(pts[j - 1] as Pt, pts[j] as Pt)) return null
  return pts.slice(1, last).map(clampPt)
}

function distToSegment(p: Pt, a: Pt, b: Pt): { d2: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const px = a.x + t * dx
  const py = a.y + t * dy
  return { d2: (p.x - px) ** 2 + (p.y - py) ** 2, t }
}

/** Index of the segment (0 = start to first bend) nearest to `point`. */
export function nearestSegment(path: WirePath, point: Pt): number {
  const pts = [path.start, ...path.bends, path.end]
  let best = 0
  let bestD = Infinity
  for (let s = 0; s < pts.length - 1; s++) {
    const { d2 } = distToSegment(point, pts[s] as Pt, pts[s + 1] as Pt)
    if (d2 < bestD) {
      bestD = d2
      best = s
    }
  }
  return best
}

/** Inserts a collinear bend on segment `segment` at the projection of `point`; null at the cap. */
export function insertBend(path: WirePath, segment: number, point: Pt): Pt[] | null {
  if (path.bends.length >= MAX_BENDS_PER_WIRE) return null
  const pts = [path.start, ...path.bends, path.end]
  const a = pts[segment]
  const b = pts[segment + 1]
  if (!a || !b) return null
  const { t } = distToSegment(point, a, b)
  const bend = clampPt({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
  const bends = [...path.bends]
  bends.splice(segment, 0, bend)
  return bends
}

export { simplifyRoute }

// ---- manual drawing (W1) ----

/** Snaps the rubber-band end to the horizontal or vertical line through `last` (the closer axis), on a 1 mm grid. */
export function snapToAxis(last: Pt, pointer: Pt): Pt {
  const snap = (v: number) => Math.round(v / 10) * 10
  const p =
    Math.abs(pointer.x - last.x) >= Math.abs(pointer.y - last.y)
      ? { x: snap(pointer.x), y: last.y }
      : { x: last.x, y: snap(pointer.y) }
  return clampPt(p)
}

/**
 * Bends of a drawn wire when it is finished on `end`: the clicked bends plus, when the last point is
 * not aligned with the end contact, exactly one 90 degree elbow. The last segment arrives the way the
 * contact is entered: vertically for top/bottom contacts, horizontally for left/right ones (`endDir`).
 */
export function finishDrawnRoute(
  start: Pt,
  bends: readonly Pt[],
  end: Pt,
  endDir: Direction = 'up',
): Pt[] {
  const last = bends[bends.length - 1] ?? start
  if (last.x === end.x || last.y === end.y) return [...bends]
  const horizontal = endDir === 'left' || endDir === 'right'
  return [...bends, horizontal ? { x: last.x, y: end.y } : { x: end.x, y: last.y }]
}
