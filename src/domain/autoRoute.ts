/** Automatic orthogonal route between two terminals (editor only): stub, horizontal channel, stub. */
import { STUB, type Direction, type Pt } from './geometry'

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
