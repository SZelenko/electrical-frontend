import { describe, expect, it } from 'vitest'
import { autoRoute } from '../autoRoute'
import { computeLayout, endpointDirection, endpointPoint, type Pt } from '../geometry'
import type { PanelContent, PanelWire } from '../panelContent'
import {
  autoRouteFor,
  insertBend,
  moveBend,
  nearestSegment,
  removeBend,
  repairRoutes,
  type WirePath,
} from '../routes'
import { block, content, cw, element, id, inputCable, panelWire, pole, rail, term } from './helpers'

const p = (x: number, y: number): Pt => ({ x, y })

/** Both coordinates may coincide (zero-length segment) but never differ on both axes. */
function axisAligned(points: readonly Pt[]): boolean {
  return points.every((a, i) => {
    const b = points[i + 1]
    return !b || a.x === b.x || a.y === b.y
  })
}

/**
 * C1 (id1: wires id2 at (300,450), id3 at (400,450)); R id10 24 modules 150 mm (cy 2500):
 * E id20 offset 2 width 2 poles 2 (inputs (638,2050),(813,2050); outputs (638,2950),(813,2950));
 * B id40 offset 8 width 1 contacts 2 (left side (1625,2088),(1625,2163)).
 */
function scene(wires: PanelWire[], over: { offset?: number; spacing?: number } = {}): PanelContent {
  return content({
    inputCables: [inputCable(1, [2, 3])],
    rails: [
      rail(
        10,
        24,
        over.spacing ?? 150,
        [element(20, over.offset ?? 2, 2, 2)],
        [block(40, 8, 1, 2)],
      ),
    ],
    wires,
  })
}

const W = id(30)
const wireOf = (c: PanelContent, wireId = W) => c.wires.find((w) => w.id === wireId) as PanelWire
const autoBends = (c: PanelContent, wire: PanelWire) => autoRouteFor(computeLayout(c), wire) as Pt[]

describe('repairRoutes (a): both endpoints moved by the same delta -> rigid translation', () => {
  it('translates every bend, diagonals included, when a rail spacing change shifts both ends', () => {
    const wire = panelWire(30, pole(id(20), 0, 'output'), term(id(40), 0), [
      p(700, 2600),
      p(900, 2000),
      p(1100, 1700),
    ])
    const before = scene([wire])
    const after = scene([wire], { spacing: 160 }) // +10 mm = +100 u for both devices
    expect(endpointPoint(computeLayout(before), wire.start)).toEqual(p(638, 2950))
    expect(endpointPoint(computeLayout(after), wire.start)).toEqual(p(638, 3050))
    const repaired = repairRoutes(before, after)
    expect(wireOf(repaired).bends).toEqual([p(700, 2700), p(900, 2100), p(1100, 1800)])
  })

  it('translates horizontally when a new input cable shifts two wires of the same cable', () => {
    const wire = panelWire(30, cw(id(2)), cw(id(3)), [p(300, 700), p(400, 700)])
    const before = scene([wire])
    // a 1-wire cable in front: 200 (box) + 100 (gap) = 300 u
    const after = { ...before, inputCables: [inputCable(9, [8]), ...before.inputCables] }
    expect(wireOf(repairRoutes(before, after)).bends).toEqual([p(600, 700), p(700, 700)])
  })

  it('a wire with no bends stays without bends', () => {
    const wire = panelWire(30, pole(id(20), 0, 'output'), term(id(40), 0), [])
    const before = scene([wire])
    const after = scene([wire], { spacing: 160 })
    expect(repairRoutes(before, after)).toBe(after)
  })

  it('never clamps: a translation that would leave the 0 .. 99999.9 mm grid draws the automatic route instead', () => {
    const wire = panelWire(30, pole(id(20), 0, 'output'), term(id(40), 0), [p(700, 5)])
    const before = scene([wire])
    const after = scene([wire], { spacing: 0 }) // shifts both ends up by 1500 u: the bend would be at y = -1495
    const bends = wireOf(repairRoutes(before, after)).bends
    // the rail block contact is entered horizontally from the left
    expect(bends).toEqual([p(638, 1550), p(1525, 1550), p(1525, 588)])
    expect(bends.every((b) => b.x >= 0 && b.y >= 0)).toBe(true)
  })
})

describe('repairRoutes (b): an untouched automatic route is re-routed', () => {
  const start = cw(id(2))
  const end = pole(id(20), 0, 'input')
  const mk = (over: { offset?: number; spacing?: number } = {}) => {
    const probe = scene([panelWire(30, start, end)], over)
    return scene([panelWire(30, start, end, autoBends(probe, panelWire(30, start, end)))], over)
  }

  it('routes the wire again after the end element moved horizontally', () => {
    const before = mk()
    expect(wireOf(before).bends).toEqual([p(300, 1250), p(638, 1250)])
    const after = {
      ...before,
      rails: [
        { ...before.rails[0]!, elements: [{ ...before.rails[0]!.elements[0]!, offsetModules: 4 }] },
      ],
    }
    expect(wireOf(repairRoutes(before, after)).bends).toEqual([p(300, 1250), p(988, 1250)])
  })

  it('routes the wire again after the end moved vertically (channel follows the midpoint)', () => {
    const before = mk()
    const after = mk({ spacing: 250 }) // rail centre 3500, pole input at y 3050
    const stale = { ...after, wires: before.wires }
    expect(wireOf(repairRoutes(before, stale)).bends).toEqual([p(300, 1750), p(638, 1750)])
  })

  it('returns the very same content when nothing moved', () => {
    const before = mk()
    const after = { ...before, rails: before.rails.map((r) => ({ ...r })) } // new objects, same geometry
    expect(repairRoutes(before, after)).toBe(after)
  })

  it('keeps the identity of unaffected wires', () => {
    const unaffected = panelWire(31, cw(id(2)), cw(id(3)), [p(300, 700), p(400, 700)])
    const moved = panelWire(30, start, end, [p(300, 1050), p(638, 1050)])
    const before = scene([moved, unaffected])
    const after = {
      ...before,
      rails: [
        { ...before.rails[0]!, elements: [{ ...before.rails[0]!.elements[0]!, offsetModules: 4 }] },
      ],
    }
    const repaired = repairRoutes(before, after)
    expect(repaired.wires[1]).toBe(unaffected)
    expect(repaired.wires[0]).not.toBe(moved)
    expect(repaired.wires[0]?.id).toBe(moved.id)
  })
})

describe('repairRoutes (c): custom bends are re-anchored without diagonals', () => {
  const moveEnd = (c: PanelContent, offset: number): PanelContent => ({
    ...c,
    rails: [{ ...c.rails[0]!, elements: [{ ...c.rails[0]!.elements[0]!, offsetModules: offset }] }],
  })
  const polyline = (c: PanelContent) => {
    const layout = computeLayout(c)
    const w = wireOf(c)
    return [endpointPoint(layout, w.start) as Pt, ...w.bends, endpointPoint(layout, w.end) as Pt]
  }

  it('moves the last bend onto the new terminal line when the last segment is perpendicular', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), [p(300, 800), p(638, 800)])
    const before = scene([wire])
    const repaired = repairRoutes(before, moveEnd(before, 4))
    expect(wireOf(repaired).bends).toEqual([p(300, 800), p(988, 800)])
    expect(axisAligned(polyline(repaired))).toBe(true)
  })

  it('inserts one elbow when the last two segments are collinear', () => {
    // last bend (638,1300) is a collinear point on the final vertical segment
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), [
      p(300, 1000),
      p(638, 1000),
      p(638, 1300),
    ])
    const before = scene([wire])
    const repaired = repairRoutes(before, moveEnd(before, 4))
    expect(wireOf(repaired).bends).toEqual([p(300, 1000), p(638, 1000), p(638, 1300), p(988, 1300)])
    expect(axisAligned(polyline(repaired))).toBe(true)
  })

  it('inserts one elbow at the start when the start moves sideways along a collinear first segment', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), [
      p(300, 700),
      p(300, 1000),
      p(638, 1000),
    ])
    const before = scene([wire])
    const after = { ...before, inputCables: [inputCable(9, [8]), ...before.inputCables] } // start x 300 -> 600
    const repaired = repairRoutes(before, after)
    expect(wireOf(repaired).bends).toEqual([p(600, 700), p(300, 700), p(300, 1000), p(638, 1000)])
    expect(axisAligned(polyline(repaired))).toBe(true)
  })

  it('keeps the user-placed collinear bends it did not touch', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), [
      p(300, 800),
      p(300, 900),
      p(638, 900),
    ])
    const before = scene([wire])
    const repaired = repairRoutes(before, moveEnd(before, 4))
    expect(wireOf(repaired).bends).toEqual([p(300, 800), p(300, 900), p(988, 900)])
  })

  it('leaves the route alone when the moved terminal stays on its last segment line', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), [p(300, 800), p(638, 800)])
    const before = scene([wire])
    const after = scene([wire], { spacing: 250 }) // end moves straight down along x = 638
    const repaired = repairRoutes(before, after)
    expect(repaired).toBe(after)
    expect(wireOf(repaired)).toBe(wire)
  })

  it('keeps the orthogonality of a long zig-zag when the end moves', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), [
      p(300, 700),
      p(500, 700),
      p(500, 900),
      p(638, 900),
    ])
    const before = scene([wire])
    const repaired = repairRoutes(before, moveEnd(before, 6))
    expect(axisAligned(polyline(repaired))).toBe(true)
    expect(wireOf(repaired).bends.slice(0, 3)).toEqual([p(300, 700), p(500, 700), p(500, 900)])
  })
})

describe('repairRoutes (c) cap: 50 bends per wire', () => {
  /** 47 collinear bends down x=300, then a horizontal jog to x=638 and one collinear bend above the end. */
  const zigzag = (collinear: number): Pt[] => [
    ...Array.from({ length: collinear }, (_, i) => p(300, 500 + 10 * i)),
    p(300, 1000),
    p(638, 1000),
    p(638, 1300),
  ]
  const moved = (c: PanelContent): PanelContent => ({
    ...c,
    rails: [{ ...c.rails[0]!, elements: [{ ...c.rails[0]!.elements[0]!, offsetModules: 4 }] }],
  })

  it('adds the elbow while the result stays within 50 bends (49 + 1)', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), zigzag(46)) // 49 bends
    const before = scene([wire])
    const bends = wireOf(repairRoutes(before, moved(before))).bends
    expect(bends).toHaveLength(50)
    expect(bends[49]).toEqual(p(988, 1300))
  })

  it('falls back to the automatic route when the elbow would make 51 bends', () => {
    const wire = panelWire(30, cw(id(2)), pole(id(20), 0, 'input'), zigzag(47)) // 50 bends
    const before = scene([wire])
    const after = moved(before)
    const bends = wireOf(repairRoutes(before, after)).bends
    expect(bends).toEqual([p(300, 1250), p(988, 1250)])
    expect(bends).toEqual(autoBends(after, wire))
  })
})

describe('repairRoutes: scope and edge cases', () => {
  const start = cw(id(2))
  const end = pole(id(20), 0, 'input')
  const mk = () => {
    const probe = scene([panelWire(30, start, end)])
    return scene([panelWire(30, start, end, autoBends(probe, panelWire(30, start, end)))])
  }
  const moved = (c: PanelContent): PanelContent => ({
    ...c,
    rails: [{ ...c.rails[0]!, elements: [{ ...c.rails[0]!.elements[0]!, offsetModules: 4 }] }],
  })

  it('only repairs the wires listed in wireIds', () => {
    const before = mk()
    const after = moved(before)
    expect(repairRoutes(before, after, new Set([id(99)]))).toBe(after)
    expect(wireOf(repairRoutes(before, after, new Set([W]))).bends).toEqual([
      p(300, 1250),
      p(988, 1250),
    ])
  })

  it('returns `after` untouched when before === after and no wire ids are given', () => {
    const c = mk()
    expect(repairRoutes(c, c)).toBe(c)
  })

  it('does not touch a wire whose endpoint no longer exists', () => {
    const before = mk()
    const after: PanelContent = { ...before, rails: [{ ...before.rails[0]!, elements: [] }] }
    expect(repairRoutes(before, after)).toBe(after)
  })

  it('does not touch a wire that did not exist before', () => {
    const before = scene([])
    const after = scene([panelWire(30, start, end, [p(1, 1)])])
    expect(repairRoutes(before, after)).toBe(after)
  })

  it('swapping the element sides re-routes the auto wire to the other edge (direction flips)', () => {
    const before = mk()
    const after: PanelContent = {
      ...before,
      rails: [
        {
          ...before.rails[0]!,
          elements: [{ ...before.rails[0]!.elements[0]!, sidesSwapped: true }],
        },
      ],
    }
    const layout = computeLayout(after)
    expect(endpointDirection(layout, end)).toBe('down')
    const bends = wireOf(repairRoutes(before, after)).bends
    expect(bends).toEqual(autoRoute(p(300, 450), 'down', p(638, 2950), 'down'))
  })
})

describe('autoRouteFor', () => {
  it('returns the automatic route for known endpoints and null for unknown ones', () => {
    const c = scene([])
    const layout = computeLayout(c)
    expect(autoRouteFor(layout, { start: cw(id(2)), end: pole(id(20), 0, 'input') })).toEqual([
      p(300, 1250),
      p(638, 1250),
    ])
    expect(autoRouteFor(layout, { start: cw(id(99)), end: pole(id(20), 0, 'input') })).toBeNull()
    expect(autoRouteFor(layout, { start: cw(id(2)), end: term(id(40), 5) })).toBeNull() // index past the count
    expect(autoRouteFor(layout, { start: cw(id(2)), end: term(id(40), 1) })).toEqual([p(300, 2163)])
  })
})

// ---- bend editing (E5) ----

const twoBends: WirePath = {
  start: p(300, 450),
  end: p(638, 1650),
  bends: [p(300, 1050), p(638, 1050)],
}
const fourBends: WirePath = {
  start: p(300, 450),
  end: p(638, 500),
  bends: [p(300, 1100), p(469, 1100), p(469, 400), p(638, 400)],
}

describe('moveBend', () => {
  it.each([
    [
      'first bend: x locked by the start terminal, y free, next bend follows y',
      twoBends,
      0,
      p(350, 900),
      [p(300, 900), p(638, 900)],
    ],
    [
      'last bend: x locked by the end terminal, previous bend follows y',
      twoBends,
      1,
      p(700, 1200),
      [p(300, 1200), p(638, 1200)],
    ],
    [
      'middle bend of a 4-bend route drags both neighbours along their shared coordinates',
      fourBends,
      1,
      p(500, 1200),
      [p(300, 1200), p(500, 1200), p(500, 400), p(638, 400)],
    ],
    [
      'moving the second middle bend',
      fourBends,
      2,
      p(520, 300),
      [p(300, 1100), p(520, 1100), p(520, 300), p(638, 300)],
    ],
    [
      'rounds to integer tenths',
      fourBends,
      1,
      p(500.4, 1200.6),
      [p(300, 1201), p(500, 1201), p(500, 400), p(638, 400)],
    ],
    [
      'clamps to the 0 .. 999999 grid',
      fourBends,
      1,
      p(-50, 2000000),
      [p(300, 999999), p(0, 999999), p(0, 400), p(638, 400)],
    ],
  ])('%s', (_n, path, k, to, expected) => {
    expect(moveBend(path, k, to)).toEqual(expected)
  })

  it('keeps the terminals out of the result and never moves them', () => {
    const result = moveBend(twoBends, 0, p(1000, 2000))
    expect(result).toHaveLength(2)
    expect(twoBends.start).toEqual(p(300, 450))
  })

  it('returns a copy of the bends for an out-of-range index', () => {
    const result = moveBend(twoBends, 7, p(1, 1))
    expect(result).toEqual(twoBends.bends)
    expect(result).not.toBe(twoBends.bends)
  })

  it('does not mutate the input path', () => {
    const snapshot = structuredClone(fourBends)
    moveBend(fourBends, 1, p(900, 900))
    expect(fourBends).toEqual(snapshot)
  })

  it('keeps an orthogonal route orthogonal for any target', () => {
    const targets = [
      p(0, 0),
      p(300, 450),
      p(1000, 1000),
      p(638, 1650),
      p(20, 3000),
      p(999999, 999999),
      p(469, 400),
    ]
    for (const path of [twoBends, fourBends]) {
      for (let k = 0; k < path.bends.length; k++) {
        for (const to of targets) {
          const out = moveBend(path, k, to)
          expect(axisAligned([path.start, ...out, path.end])).toBe(true)
        }
      }
    }
  })
})

describe('insertBend / nearestSegment', () => {
  it.each([
    ['on the horizontal channel', 1, p(500, 1200), [p(300, 1050), p(500, 1050), p(638, 1050)]],
    [
      'on the first vertical segment (inserted first)',
      0,
      p(310, 800),
      [p(300, 800), p(300, 1050), p(638, 1050)],
    ],
    [
      'on the last vertical segment (appended)',
      2,
      p(700, 1300),
      [p(300, 1050), p(638, 1050), p(638, 1300)],
    ],
    [
      'beyond the segment end clamps to the end of the segment',
      1,
      p(2000, 1050),
      [p(300, 1050), p(638, 1050), p(638, 1050)],
    ],
  ])('%s', (_n, segment, point, expected) => {
    expect(insertBend(twoBends, segment, point)).toEqual(expected)
  })

  it('inserts a collinear bend (no new direction change)', () => {
    const out = insertBend(twoBends, 1, p(500, 1200)) as Pt[]
    expect(axisAligned([twoBends.start, ...out, twoBends.end])).toBe(true)
  })

  it('returns null at the 50-bend cap', () => {
    const full: WirePath = {
      start: p(0, 0),
      end: p(0, 1000),
      bends: Array.from({ length: 50 }, (_, i) => p(0, 10 + i)),
    }
    expect(insertBend(full, 3, p(0, 20))).toBeNull()
    const almost: WirePath = { ...full, bends: full.bends.slice(0, 49) }
    expect(insertBend(almost, 3, p(0, 20))).toHaveLength(50)
  })

  it('returns null for a segment that does not exist', () => {
    expect(insertBend(twoBends, 9, p(1, 1))).toBeNull()
    expect(insertBend(twoBends, -1, p(1, 1))).toBeNull()
  })

  it('works on a wire without bends (segment 0 is the whole wire)', () => {
    const straight: WirePath = { start: p(300, 450), end: p(300, 1650), bends: [] }
    expect(insertBend(straight, 0, p(310, 900))).toEqual([p(300, 900)])
  })

  it.each([
    [p(305, 800), 0],
    [p(500, 1100), 1],
    [p(640, 1400), 2],
    [p(300, 1049), 0], // closer to the first segment's end than the second's start? both touch; first wins ties
  ])('nearestSegment(%j) = %i', (point, expected) => {
    expect(nearestSegment(twoBends, point)).toBe(expected)
  })

  it('nearestSegment of a bendless wire is 0', () => {
    expect(nearestSegment({ start: p(0, 0), end: p(10, 0), bends: [] }, p(5, 5))).toBe(0)
  })
})

describe('removeBend', () => {
  const collinear: WirePath = {
    start: p(300, 450),
    end: p(638, 1650),
    bends: [p(300, 700), p(300, 900), p(638, 900)],
  }

  it('removing a collinear first bend needs no re-alignment', () => {
    expect(removeBend(collinear, 0)).toEqual([p(300, 900), p(638, 900)])
  })

  it('removing the last bend re-aligns the previous one onto the terminal line', () => {
    expect(removeBend(collinear, 2)).toEqual([p(300, 700), p(300, 1650)])
  })

  it.each([-1, 3, 99])('returns null for bend index %i', (k) => {
    expect(removeBend(collinear, k)).toBeNull()
  })

  it('does not mutate the input path', () => {
    const snapshot = structuredClone(collinear)
    removeBend(collinear, 2)
    expect(collinear).toEqual(snapshot)
  })

  it('removing the only bend of a wire whose terminals are aligned leaves a straight wire', () => {
    const straightish: WirePath = { start: p(300, 450), end: p(300, 1650), bends: [p(300, 900)] }
    expect(removeBend(straightish, 0)).toEqual([])
  })

  describe('never leaves a diagonal segment (returns null when no orthogonal join exists)', () => {
    const routes: [string, WirePath][] = [
      ['2-bend channel', twoBends],
      ['4-bend detour', fourBends],
      ['collinear stairs', collinear],
    ]
    const cases = routes.flatMap(([name, path]) =>
      path.bends.map((_, k) => [`${name}, bend ${k}`, path, k] as const),
    )
    it.each(cases)('%s', (_n, path, k) => {
      const out = removeBend(path, k)
      expect(out === null || axisAligned([path.start, ...out, path.end])).toBe(true)
    })
  })
})
