import { describe, expect, it } from 'vitest'
import { addWire, totalBends } from '../commands'
import { CORNER_RADIUS, roundedPath, type Pt } from '../geometry'
import { MAX_COORD_U } from '../limits'
import type { PanelContent, WireColour } from '../panelContent'
import { finishDrawnRoute, snapToAxis } from '../routes'
import { defaultWireColour } from '../wireDefaults'
import {
  buildWorld,
  content,
  cw,
  element,
  id,
  inputCable,
  newWire,
  outputCable,
  panelWire,
  pole,
  rail,
  rejection,
  run,
  term,
  block,
} from './helpers'

const p = (x: number, y: number): Pt => ({ x, y })
const world = buildWorld()

describe('addWire validates the drawn route', () => {
  const start = cw(id(2)) // (100,300)
  const end = pole(id(20), 0, 'input') // (288,1900)
  const add = (bends: Pt[], base: PanelContent = world) =>
    addWire(newWire(60, start, end, bends))(base)

  it('stores the bends exactly as drawn (no auto route)', () => {
    const out = run(world, addWire(newWire(60, start, end, [p(100, 800), p(288, 800)]))).content
    expect(out.wires[4]?.bends).toEqual([p(100, 800), p(288, 800)])
  })

  it('accepts a straight wire between aligned contacts with no bends', () => {
    const out = run(world, addWire(newWire(60, cw(id(2)), cw(id(3))))).content
    expect(out.wires[4]?.bends).toEqual([])
  })

  it('accepts a route that goes around (orthogonal with backtracking)', () => {
    expect(rejection(add([p(100, 200), p(900, 200), p(900, 1900)]))).toBeNull()
  })

  it.each([
    ['a diagonal first segment', [p(110, 1050), p(288, 1050)]],
    ['a diagonal last segment', [p(100, 1050)]],
    ['a diagonal middle segment', [p(100, 800), p(200, 900), p(288, 900)]],
    ['no bends between misaligned contacts', []],
  ])('rejects %s as not orthogonal', (_n, bends) => {
    const out = add(bends)
    expect(out).toMatchObject({ ok: false, reason: 'invalid', detail: 'orthogonal' })
  })

  it.each([
    ['a fractional x', [p(100.5, 1050), p(288, 1050)]],
    ['a fractional y', [p(100, 1050.5), p(288, 1050.5)]],
    ['NaN', [p(Number.NaN, 1050), p(288, 1050)]],
  ])('rejects %s', (_n, bends) => {
    expect(add(bends)).toMatchObject({ ok: false, reason: 'invalid', detail: 'bends' })
  })

  it('accepts exactly 50 bends and rejects 51', () => {
    const fifty = [
      ...Array.from({ length: 49 }, (_, i) => p(100, 500 + i)),
      p(100, 1900), // aligned with the pole input row
    ]
    expect(fifty).toHaveLength(50)
    expect(rejection(add(fifty))).toBeNull()
    const fiftyOne = [p(100, 499), ...fifty]
    expect(add(fiftyOne)).toMatchObject({ ok: false, reason: 'limit', detail: 'bends' })
  })

  it('respects the total cap of 20000 bends', () => {
    const bends = Array.from({ length: 50 }, () => p(300, 450))
    const heavy = (n: number): PanelContent => ({
      ...world,
      wires: Array.from({ length: n }, (_, i) => panelWire(1000 + i, cw(id(2)), cw(id(3)), bends)),
    })
    const route = [...Array.from({ length: 49 }, (_, i) => p(100, 500 + i)), p(100, 1900)]
    expect(rejection(addWire(newWire(60, start, end, route))(heavy(399)))).toBeNull() // 19950 + 50
    expect(rejection(addWire(newWire(60, start, end, route))(heavy(400)))).toBe('limit') // 20000 + 50
    expect(add([p(100, 1050), p(288, 1050)], heavy(400))).toMatchObject({
      ok: false,
      reason: 'limit',
      detail: 'bends',
    })
  })

  it.each([
    ['below 0', [p(100, -10), p(288, -10)]],
    ['past 99999.9 mm', [p(100, MAX_COORD_U + 1), p(288, MAX_COORD_U + 1)]],
    ['left of 0', [p(-5, 300), p(-5, 1900)]],
  ])('rejects a bend %s as outside the coordinate range', (_n, bends) => {
    expect(add(bends)).toMatchObject({ ok: false, reason: 'limit', detail: 'coordinates' })
  })

  it('accepts bends on the range edges 0 and 999999', () => {
    expect(rejection(add([p(100, 0), p(288, 0)]))).toBeNull()
    expect(rejection(add([p(100, MAX_COORD_U), p(288, MAX_COORD_U)]))).toBeNull()
  })

  it.each([
    ['the same terminal on both ends', newWire(60, cw(id(2)), cw(id(2))), 'sameTerminal'],
    ['an unknown contact', newWire(60, cw(id(99)), end), 'notFound'],
    ['a taken id', newWire(30, cw(id(2)), cw(id(3))), 'duplicateId'],
  ])('keeps rejecting %s', (_n, spec, reason) => {
    expect(rejection(addWire(spec)(world))).toBe(reason)
  })

  it('does not mutate the spec bends', () => {
    const bends = [p(100, 800), p(288, 800)]
    const snapshot = structuredClone(bends)
    run(world, addWire(newWire(60, start, end, bends)))
    expect(bends).toEqual(snapshot)
  })
})

describe('totalBends', () => {
  it('is 0 for a panel without wires', () => {
    expect(totalBends(content({ inputCables: [inputCable(1, [2, 3])] }))).toBe(0)
  })

  it('sums the bends of every wire', () => {
    const w = (n: number, bends: Pt[]) => panelWire(n, cw(id(2)), cw(id(3)), bends)
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      wires: [w(30, [p(1, 1), p(2, 2)]), w(31, []), w(32, [p(3, 3)])],
    })
    expect(totalBends(c)).toBe(3)
  })

  it('counts the bends added by addWire', () => {
    const after = run(
      content({ inputCables: [inputCable(1, [2, 3])] }),
      addWire(newWire(60, cw(id(2)), cw(id(3)), [p(100, 900), p(150, 900)])),
    ).content
    expect(totalBends(after)).toBe(2)
  })
})

describe('snapToAxis', () => {
  const last = p(300, 450)
  it.each([
    ['the horizontal axis when the pointer is closer to it', p(500, 470), p(500, 450)],
    ['the vertical axis when the pointer is closer to it', p(310, 900), p(300, 900)],
    ['horizontal on a tie', p(400, 550), p(400, 450)],
    ['a pointer on the last point', p(300, 450), p(300, 450)],
    ['the 1 mm grid (x rounds down)', p(504, 452), p(500, 450)],
    ['the 1 mm grid (x rounds half up)', p(505, 460), p(510, 450)],
    ['the 1 mm grid (y)', p(302, 903), p(300, 900)],
    ['left of the drawing: clamped to 0', p(-500, 450), p(0, 450)],
    ['past the range: clamped to 999999', p(2000000, 450), p(MAX_COORD_U, 450)],
    ['above the drawing: clamped to 0', p(300, -900), p(300, 0)],
  ])('%s', (_n, pointer, expected) => {
    expect(snapToAxis(last, pointer)).toEqual(expected)
  })

  it('keeps an off-grid last coordinate on the fixed axis', () => {
    expect(snapToAxis(p(305, 455), p(505, 460))).toEqual(p(510, 455))
  })

  it('always returns a point aligned with the last one, on integer coordinates', () => {
    const bad: string[] = []
    for (const x of [-30, 0, 7, 299, 300, 301, 1234])
      for (const y of [-30, 0, 9, 449, 450, 451, 2222]) {
        const out = snapToAxis(last, p(x, y))
        if (!(out.x === last.x || out.y === last.y) || !Number.isInteger(out.x + out.y))
          bad.push(`${x},${y}`)
      }
    expect(bad).toEqual([])
  })
})

describe('finishDrawnRoute', () => {
  it.each([
    ['aligned vertically with the start: no elbow', p(300, 450), [], p(300, 2050), []],
    ['aligned horizontally with the start: no elbow', p(300, 450), [], p(900, 450), []],
    [
      'last bend aligned with the end (same y): no elbow',
      p(300, 450),
      [p(300, 2050)],
      p(638, 2050),
      [p(300, 2050)],
    ],
    [
      'last bend aligned with the end (same x): no elbow',
      p(300, 450),
      [p(638, 450)],
      p(638, 2050),
      [p(638, 450)],
    ],
  ] as [string, Pt, Pt[], Pt, Pt[]][])('%s', (_n, start, bends, end, expected) => {
    expect(finishDrawnRoute(start, bends, end)).toEqual(expected)
  })

  it.each([
    ['from the start', p(300, 450), [], p(288, 2050), [p(288, 450)]],
    ['from the last bend', p(300, 450), [p(300, 800)], p(638, 2050), [p(300, 800), p(638, 800)]],
    [
      'from two bends',
      p(300, 450),
      [p(300, 800), p(500, 800)],
      p(638, 2050),
      [p(300, 800), p(500, 800), p(638, 800)],
    ],
  ] as [string, Pt, Pt[], Pt, Pt[]][])(
    'adds exactly one elbow at (end.x, last.y) %s',
    (_n, start, bends, end, expected) => {
      const out = finishDrawnRoute(start, bends, end)
      expect(out).toEqual(expected)
      expect(out).toHaveLength(bends.length + 1)
    },
  )

  it('the finished route is orthogonal start to end for any clicks that are themselves orthogonal', () => {
    const bad: string[] = []
    const start = p(300, 450)
    for (const end of [p(300, 2050), p(288, 2050), p(900, 450), p(100, 100), p(300, 450)]) {
      for (const bends of [
        [],
        [p(300, 800)],
        [p(300, 800), p(700, 800)],
        [p(700, 450), p(700, 900)],
      ]) {
        const pts = [start, ...finishDrawnRoute(start, bends, end), end]
        if (!pts.every((a, i) => !pts[i + 1] || a.x === pts[i + 1]!.x || a.y === pts[i + 1]!.y))
          bad.push(JSON.stringify([end, bends]))
      }
    }
    expect(bad).toEqual([])
  })

  it('does not mutate the clicked bends and returns a new array', () => {
    const bends = [p(300, 800)]
    const out = finishDrawnRoute(p(300, 450), bends, p(300, 2050))
    expect(bends).toEqual([p(300, 800)])
    expect(out).not.toBe(bends)
  })

  it('a wire finished this way is accepted by addWire', () => {
    const start = cw(id(2))
    const end = pole(id(20), 0, 'input')
    const bends = finishDrawnRoute(p(100, 300), [p(100, 800), p(700, 800)], p(288, 1900))
    expect(rejection(addWire(newWire(60, start, end, bends))(world))).toBeNull()
  })
})

describe('defaultWireColour (W3)', () => {
  const colours: WireColour[] = ['green-yellow', 'red']
  const c: PanelContent = content({
    inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
    outputCables: [outputCable(4, [5])],
    rails: [rail(10, 24, 150, [element(20, 0, 2, 2)], [block(40, 4, 2, 2)])],
  })
  const wired = (wires: PanelContent['wires']): PanelContent => ({ ...c, wires })

  it('a cable wire contact gives the colour of that wire', () => {
    expect(defaultWireColour(c, cw(id(2)), 'red')).toBe('brown')
    expect(defaultWireColour(c, cw(id(3)), 'red')).toBe('blue')
  })

  it('an output cable wire gives its colour too', () => {
    expect(defaultWireColour(c, cw(id(5)), 'red')).toBe('black')
  })

  it('an unknown cable wire falls back', () => {
    expect(defaultWireColour(c, cw(id(99)), 'red')).toBe('red')
  })

  it('a pole or terminal with no wire falls back to the toolbar colour', () => {
    expect(defaultWireColour(c, pole(id(20), 0, 'input'), 'green-yellow')).toBe('green-yellow')
    expect(defaultWireColour(c, term(id(40), 1), 'blue')).toBe('blue')
  })

  it('a pole takes the colour of a wire attached to it, as start or as end', () => {
    const asStart = wired([
      { ...panelWire(30, pole(id(20), 0, 'input'), cw(id(2))), colour: 'red' },
    ])
    const asEnd = wired([
      { ...panelWire(30, cw(id(2)), pole(id(20), 0, 'input')), colour: 'green-yellow' },
    ])
    expect(defaultWireColour(asStart, pole(id(20), 0, 'input'), 'blue')).toBe('red')
    expect(defaultWireColour(asEnd, pole(id(20), 0, 'input'), 'blue')).toBe('green-yellow')
  })

  it('a terminal takes the colour of a wire attached to it', () => {
    const w = wired([{ ...panelWire(30, cw(id(2)), term(id(40), 1)), colour: 'red' }])
    expect(defaultWireColour(w, term(id(40), 1), 'blue')).toBe('red')
    expect(defaultWireColour(w, term(id(40), 0), 'blue')).toBe('blue') // another terminal of the bar
  })

  it('with several wires the first in draw order wins', () => {
    const first = { ...panelWire(30, cw(id(2)), term(id(40), 0)), colour: colours[0] as WireColour }
    const second = {
      ...panelWire(31, cw(id(3)), term(id(40), 0)),
      colour: colours[1] as WireColour,
    }
    expect(defaultWireColour(wired([first, second]), term(id(40), 0), 'blue')).toBe('green-yellow')
    expect(defaultWireColour(wired([second, first]), term(id(40), 0), 'blue')).toBe('red')
  })

  it('the input and the output of one pole are different contacts', () => {
    const w = wired([{ ...panelWire(30, cw(id(2)), pole(id(20), 0, 'input')), colour: 'red' }])
    expect(defaultWireColour(w, pole(id(20), 0, 'output'), 'blue')).toBe('blue')
    expect(defaultWireColour(w, pole(id(20), 1, 'input'), 'blue')).toBe('blue')
  })
})

describe('roundedPath (W5)', () => {
  it('the corner radius is 3 mm', () => expect(CORNER_RADIUS).toBe(30))

  it.each([
    [
      'right then down (clockwise, sweep 1)',
      [p(0, 0), p(100, 0), p(100, 100)],
      'M0 0 L70 0 A30 30 0 0 1 100 30 L100 100',
    ],
    [
      'down then left (clockwise)',
      [p(100, 0), p(100, 100), p(0, 100)],
      'M100 0 L100 70 A30 30 0 0 1 70 100 L0 100',
    ],
    [
      'left then up (clockwise)',
      [p(100, 100), p(0, 100), p(0, 0)],
      'M100 100 L30 100 A30 30 0 0 1 0 70 L0 0',
    ],
    [
      'up then right (clockwise)',
      [p(0, 100), p(0, 0), p(100, 0)],
      'M0 100 L0 30 A30 30 0 0 1 30 0 L100 0',
    ],
    [
      'right then up (counter-clockwise, sweep 0)',
      [p(0, 100), p(100, 100), p(100, 0)],
      'M0 100 L70 100 A30 30 0 0 0 100 70 L100 0',
    ],
    [
      'up then left (counter-clockwise)',
      [p(100, 100), p(100, 0), p(0, 0)],
      'M100 100 L100 30 A30 30 0 0 0 70 0 L0 0',
    ],
    [
      'left then down (counter-clockwise)',
      [p(100, 0), p(0, 0), p(0, 100)],
      'M100 0 L30 0 A30 30 0 0 0 0 30 L0 100',
    ],
    [
      'down then right (counter-clockwise)',
      [p(0, 0), p(0, 100), p(100, 100)],
      'M0 0 L0 70 A30 30 0 0 0 30 100 L100 100',
    ],
  ])('a single turn: %s', (_n, pts, d) => {
    expect(roundedPath(pts)).toBe(d)
  })

  it.each([
    [
      'the outgoing segment is short (40)',
      [p(0, 0), p(100, 0), p(100, 40)],
      'M0 0 L80 0 A20 20 0 0 1 100 20 L100 40',
    ],
    [
      'the incoming segment is short (40)',
      [p(0, 0), p(40, 0), p(40, 100)],
      'M0 0 L20 0 A20 20 0 0 1 40 20 L40 100',
    ],
    [
      'both segments are short (40 and 20)',
      [p(0, 0), p(40, 0), p(40, 20)],
      'M0 0 L30 0 A10 10 0 0 1 40 10 L40 20',
    ],
    [
      'a 3 mm segment is exactly enough for a full-radius arc on its own side',
      [p(0, 0), p(100, 0), p(100, 60)],
      'M0 0 L70 0 A30 30 0 0 1 100 30 L100 60',
    ],
  ])('the radius is clamped to half of the shorter segment: %s', (_n, pts, d) => {
    expect(roundedPath(pts)).toBe(d)
  })

  it('two consecutive turns share a middle segment: each takes at most half of it', () => {
    expect(roundedPath([p(0, 0), p(100, 0), p(100, 60), p(200, 60)])).toBe(
      'M0 0 L70 0 A30 30 0 0 1 100 30 L100 30 A30 30 0 0 0 130 60 L200 60',
    )
    expect(roundedPath([p(0, 0), p(100, 0), p(100, 40), p(200, 40)])).toBe(
      'M0 0 L80 0 A20 20 0 0 1 100 20 L100 20 A20 20 0 0 0 120 40 L200 40',
    )
  })

  it.each([
    ['collinear points (no arc)', [p(0, 0), p(0, 50), p(0, 100)], 'M0 0 L0 50 L0 100'],
    ['a reversal on the same line (no arc)', [p(0, 0), p(0, 100), p(0, 50)], 'M0 0 L0 100 L0 50'],
    ['a zero-length segment is dropped', [p(0, 0), p(0, 0), p(50, 0)], 'M0 0 L50 0'],
    [
      'a duplicate corner point is dropped before the arc',
      [p(0, 0), p(100, 0), p(100, 0), p(100, 100)],
      'M0 0 L70 0 A30 30 0 0 1 100 30 L100 100',
    ],
    ['a straight wire', [p(0, 0), p(100, 0)], 'M0 0 L100 0'],
    ['a single point', [p(5, 5)], 'M5 5'],
    ['no points', [], ''],
  ])('%s', (_n, pts, d) => {
    expect(roundedPath(pts)).toBe(d)
  })

  it('does not change the stored points (rendering only)', () => {
    const pts = [p(0, 0), p(100, 0), p(100, 100)]
    const snapshot = structuredClone(pts)
    roundedPath(pts)
    expect(pts).toEqual(snapshot)
  })

  it('a wire of the world starts and ends exactly on its contacts', () => {
    const w = world.wires[0]!
    const pts = [p(300, 450), ...w.bends, p(288, 2050)]
    const d = roundedPath(pts)
    expect(d.startsWith('M300 450')).toBe(true)
    expect(d.endsWith('L288 2050')).toBe(true)
    expect(d.match(/A/g)).toHaveLength(2)
  })
})
