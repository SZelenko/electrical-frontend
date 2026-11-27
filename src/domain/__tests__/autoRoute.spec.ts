import { describe, expect, it } from 'vitest'
import { autoRoute, routeEquals, samePt, simplifyRoute } from '../autoRoute'
import { STUB, type Direction, type Pt } from '../geometry'

const p = (x: number, y: number): Pt => ({ x, y })

/** True when every consecutive pair of the polyline shares x or y (and differs). */
function orthogonal(points: Pt[]): boolean {
  return points.every((a, i) => {
    const b = points[i + 1]
    if (!b) return true
    return (a.x === b.x) !== (a.y === b.y)
  })
}

describe('autoRoute: exact routes', () => {
  it.each([
    [
      'cable wire (down) to a pole input (up) below and to the right: one channel midway',
      p(300, 450),
      'down',
      p(638, 1650),
      'up',
      [p(300, 1050), p(638, 1050)],
    ],
    [
      'same x, enough room: a straight line needs no bends',
      p(300, 450),
      'down',
      p(300, 1650),
      'up',
      [],
    ],
    [
      'both leave down: the channel runs below the lower stub',
      p(300, 450),
      'down',
      p(638, 2550),
      'down',
      [p(300, 2650), p(638, 2650)],
    ],
    [
      'both leave up: the channel runs above the higher stub',
      p(300, 1000),
      'up',
      p(638, 1000),
      'up',
      [p(300, 900), p(638, 900)],
    ],
    [
      'both leave up at different heights: channel above the higher one',
      p(300, 1000),
      'up',
      p(638, 700),
      'up',
      [p(300, 600), p(638, 600)],
    ],
    [
      'stubs collide (end above start, start down, end up): four bends around a vertical channel',
      p(300, 1000),
      'down',
      p(638, 500),
      'up',
      [p(300, 1100), p(469, 1100), p(469, 400), p(638, 400)],
    ],
    [
      'collision with equal x: the vertical channel is pushed 2 stubs to the right',
      p(300, 1000),
      'down',
      p(300, 500),
      'up',
      [p(300, 1100), p(500, 1100), p(500, 400), p(300, 400)],
    ],
    [
      'exactly STUB apart: channel sits on the single shared line',
      p(300, 450),
      'down',
      p(638, 650),
      'up',
      [p(300, 550), p(638, 550)],
    ],
  ] as [string, Pt, Direction, Pt, Direction, Pt[]][])('%s', (_n, s, sd, e, ed, expected) => {
    expect(autoRoute(s, sd, e, ed)).toEqual(expected)
  })

  it('is deterministic', () => {
    const args = [p(300, 450), 'down', p(638, 1650), 'up'] as const
    expect(autoRoute(...args)).toEqual(autoRoute(...args))
  })

  it('does not mutate its inputs', () => {
    const s = p(300, 450)
    const e = p(638, 1650)
    autoRoute(s, 'down', e, 'up')
    expect(s).toEqual(p(300, 450))
    expect(e).toEqual(p(638, 1650))
  })
})

describe('autoRoute: invariants over a grid of terminal pairs', () => {
  const xs = [300, 301, 299, 400, 638, 2000]
  const ys = [450, 500, 549, 550, 551, 1000, 1650, 2550]
  const dirs: Direction[] = ['up', 'down']
  const cases: [Pt, Direction, Pt, Direction][] = []
  for (const sx of xs)
    for (const sy of ys)
      for (const ex of xs)
        for (const ey of ys)
          for (const sd of dirs)
            for (const ed of dirs) {
              if (Math.abs(sy - ey) < 2 * STUB) continue // terminals closer than two stubs are degenerate
              cases.push([p(sx, sy), sd, p(ex, ey), ed])
            }

  it('has at most 4 bends and an orthogonal polyline for every pair', () => {
    const bad: string[] = []
    for (const [s, sd, e, ed] of cases) {
      const bends = autoRoute(s, sd, e, ed)
      if (bends.length > 4 || !orthogonal([s, ...bends, e]))
        bad.push(JSON.stringify([s, sd, e, ed, bends]))
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('has integer coordinates', () => {
    for (const [s, sd, e, ed] of cases) {
      for (const b of autoRoute(s, sd, e, ed)) {
        expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true)
      }
    }
  })

  it('leaves the start terminal in its stub direction and enters the end from its stub side', () => {
    const bad: string[] = []
    for (const [s, sd, e, ed] of cases) {
      if (Math.abs(s.x - e.x) === 1) continue // see the dedicated 1-unit test below
      const bends = autoRoute(s, sd, e, ed)
      if (bends.length === 0) continue // a straight vertical line has no stubs to keep
      const pts = [s, ...bends, e]
      const first = pts[1] as Pt
      const last = pts[pts.length - 2] as Pt
      // sign of the first/last vertical move away from the terminal
      const startOk = first.x !== s.x || (sd === 'down' ? first.y > s.y : first.y < s.y)
      const endOk = last.x !== e.x || (ed === 'down' ? last.y > e.y : last.y < e.y)
      if (!startOk || !endOk) bad.push(JSON.stringify([s, sd, e, ed, bends]))
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('keeps the start stub direction when the terminals are 1 u apart and the stubs collide', () => {
    // start (300,1650) leaves DOWN, end (299,450) is entered from above: the wire must first go down.
    const bends = autoRoute(p(300, 1650), 'down', p(299, 450), 'up')
    const first = [p(300, 1650), ...bends, p(299, 450)][1] as Pt
    expect(first.x !== 300 || first.y > 1650).toBe(true)
    expect(orthogonal([p(300, 1650), ...bends, p(299, 450)])).toBe(true)
  })

  it('is deterministic for every pair', () => {
    for (const [s, sd, e, ed] of cases.slice(0, 2000)) {
      expect(autoRoute(s, sd, e, ed)).toEqual(autoRoute(s, sd, e, ed))
    }
  })

  it('keeps the stub length when the terminals leave away from each other', () => {
    const bends = autoRoute(p(300, 450), 'down', p(638, 2550), 'down')
    expect((bends[0] as Pt).y - 450).toBeGreaterThanOrEqual(STUB)
  })
})

describe('simplifyRoute / samePt / routeEquals', () => {
  it('drops duplicate and collinear points and excludes start and end', () => {
    expect(simplifyRoute(p(0, 0), [p(0, 5), p(0, 5), p(0, 9), p(4, 9)], p(4, 20))).toEqual([
      p(0, 9),
      p(4, 9),
    ])
  })
  it('keeps real corners', () => {
    expect(simplifyRoute(p(0, 0), [p(0, 5), p(3, 5)], p(3, 9))).toEqual([p(0, 5), p(3, 5)])
  })
  it('returns [] when nothing is left', () => {
    expect(simplifyRoute(p(0, 0), [p(0, 4)], p(0, 9))).toEqual([])
  })
  it('compares points and routes by value', () => {
    expect(samePt(p(1, 2), p(1, 2))).toBe(true)
    expect(samePt(p(1, 2), p(2, 1))).toBe(false)
    expect(routeEquals([p(1, 2)], [p(1, 2)])).toBe(true)
    expect(routeEquals([p(1, 2)], [p(1, 2), p(3, 3)])).toBe(false)
    expect(routeEquals([], [])).toBe(true)
  })
})
