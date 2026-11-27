import { describe, expect, it } from 'vitest'
import {
  ROW_BLOCK_H,
  VBLOCK_INSET,
  VBLOCK_PITCH,
  CABLE_BOX_H,
  CABLE_GAP,
  CABLE_PAD,
  CABLE_PITCH,
  CABLE_ROW_GAP,
  ELEMENT_H,
  GREEN_YELLOW_OVERLAY,
  MARGIN,
  MODULE,
  RAIL_H,
  SHORT_CIRCUIT_HIGHLIGHT,
  STUB,
  WIRE_COLOUR_HEX,
  WIRE_STROKE_MM,
  cableBoxWidth,
  computeLayout,
  endpointDirection,
  endpointPoint,
  haloWidthMm,
  mmToTenths,
  tenthsToMm,
  terminalX,
  viewBounds,
  wirePolyline,
} from '../geometry'
import {
  buildWorld,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  panelWire,
  pole,
  rail,
  rowBlock,
  term,
} from './helpers'

describe('geometry constants (panel-domain, integer tenths of mm)', () => {
  it.each([
    ['MODULE', MODULE, 175],
    ['MARGIN', MARGIN, 200],
    ['CABLE_BOX_H', CABLE_BOX_H, 250],
    ['CABLE_PAD', CABLE_PAD, 50],
    ['CABLE_PITCH', CABLE_PITCH, 100],
    ['CABLE_GAP', CABLE_GAP, 100],
    ['CABLE_ROW_GAP', CABLE_ROW_GAP, 150],
    ['RAIL_H', RAIL_H, 350],
    ['ELEMENT_H', ELEMENT_H, 900],
    ['ROW_BLOCK_H', ROW_BLOCK_H, 250],
    ['VBLOCK_PITCH', VBLOCK_PITCH, 75],
    ['VBLOCK_INSET', VBLOCK_INSET, 25],
    ['STUB', STUB, 100],
  ])('%s = %i', (_n, actual, expected) => {
    expect(actual).toBe(expected)
  })

  it('one module is 17.5 mm', () => expect(tenthsToMm(MODULE)).toBe(17.5))

  it.each([
    [150, 1500],
    [150.3, 1503],
    [0.3, 3],
    [0.1, 1],
    [99999.9, 999999],
    [0, 0],
  ])('mmToTenths(%d) = %d', (mm, u) => expect(mmToTenths(mm)).toBe(u))

  it('mm <-> tenths round-trips for every grid value', () => {
    const bad: number[] = []
    for (let u = 0; u <= 999999; u++) {
      if (mmToTenths(tenthsToMm(u)) !== u) bad.push(u)
    }
    expect(bad).toEqual([])
  })
})

describe('terminalX (exact rational, round half up)', () => {
  it.each([
    // [x0, widthModules, i, n, expected]
    [0, 1, 0, 1, 88], // 87.5 -> 88
    [0, 2, 0, 2, 88], // 87.5 -> 88
    [0, 2, 1, 2, 263], // 262.5 -> 263
    [0, 1, 0, 3, 29], // 29.17
    [0, 1, 1, 3, 88], // 87.5 -> 88
    [0, 1, 2, 3, 146], // 145.83 -> 146
    [200, 3, 0, 3, 288], // 87.5 -> 88
    [550, 3, 0, 3, 638],
    [550, 3, 1, 3, 813],
    [550, 3, 2, 3, 988],
    [0, 2, 0, 4, 44], // 43.75
    [0, 2, 1, 4, 131], // 131.25
    [0, 2, 2, 4, 219], // 218.75
    [0, 2, 3, 4, 306], // 306.25
    [0, 2, 0, 3, 58], // 58.33
    [0, 2, 1, 3, 175], // exactly 175
    [0, 2, 2, 3, 292], // 291.67
    [0, 60, 0, 120, 44], // 43.75
    [0, 60, 1, 120, 131], // 131.25
    [0, 60, 2, 120, 219], // 218.75
    [0, 60, 119, 120, 10456], // 10456.25
  ])('x0=%i width=%i terminal %i of %i -> %i', (x0, w, i, n, expected) => {
    expect(terminalX(x0, w, i, n)).toBe(expected)
  })

  it('1 module x 3 poles stays inside the body and strictly increases', () => {
    const xs = [0, 1, 2].map((i) => terminalX(0, 1, i, 3))
    expect(xs).toEqual([29, 88, 146])
    expect(xs.every((x) => x > 0 && x < MODULE)).toBe(true)
  })

  it('120 terminals on a 60-module block: integers, strictly increasing, pitch 87 or 88, inside the body', () => {
    const xs = Array.from({ length: 120 }, (_, i) => terminalX(0, 60, i, 120))
    expect(xs.every(Number.isInteger)).toBe(true)
    for (let i = 1; i < xs.length; i++) {
      const d = (xs[i] as number) - (xs[i - 1] as number)
      expect([87, 88]).toContain(d)
    }
    expect(xs[0]).toBeGreaterThan(0)
    expect(xs[119]).toBeLessThan(60 * MODULE)
    // symmetric around the body centre within one unit
    expect((xs[0] as number) + (xs[119] as number)).toBeGreaterThanOrEqual(60 * MODULE - 1)
    expect((xs[0] as number) + (xs[119] as number)).toBeLessThanOrEqual(60 * MODULE + 1)
  })
})

describe('cable box width', () => {
  it.each([
    [1, 200],
    [2, 300],
    [3, 400],
    [4, 500],
  ])('%i wires -> %i', (n, w) => expect(cableBoxWidth(n)).toBe(w))
})

describe('computeLayout: empty panel', () => {
  const layout = computeLayout(content({ inputCables: [inputCable(1, [2, 3])] }))

  it('input cable box and wire points sit on the bottom edge', () => {
    expect(layout.inputBoxes).toHaveLength(1)
    expect(layout.inputBoxes[0]).toMatchObject({ x: 200, y: 200, w: 300, h: 250, kind: 'input' })
    expect(layout.inputBoxes[0]?.wires.map((w) => w.pt)).toEqual([
      { x: 300, y: 450 },
      { x: 400, y: 450 },
    ])
  })

  it('railsTop and outTop (no rails) follow the formulas', () => {
    expect(layout.rowTop).toBe(600)
    expect(layout.railsTop).toBe(1000) // rowTop + ROW_BLOCK_H + CABLE_ROW_GAP
    expect(layout.outTop).toBe(1150) // railsTop + CABLE_ROW_GAP
    expect(layout.rails).toEqual([])
  })

  it('drawing size: width 2*MARGIN + 60 modules, height outTop + box + MARGIN', () => {
    expect(layout.width).toBe(400 + 60 * 175)
    expect(layout.height).toBe(1150 + 250 + 200)
  })
})

describe('computeLayout: the world', () => {
  const world = buildWorld()
  const layout = computeLayout(world)

  it('rail centre lines use centre-to-centre spacing, the first from railsTop', () => {
    expect(layout.rails.map((r) => r.cy)).toEqual([1000 + 1500, 1000 + 1500 + 1000])
  })

  it('rail strip: x = MARGIN, width = modules * MODULE, centred on the line', () => {
    expect(layout.rails[0]).toMatchObject({ x: 200, y: 2500 - 175, w: 24 * 175, h: 350, index: 0 })
    expect(layout.rails[1]).toMatchObject({ x: 200, y: 3500 - 175, w: 24 * 175, h: 350, index: 1 })
  })

  it('element boxes are centred on the rail line', () => {
    expect(layout.elements.get(id(20))).toMatchObject({
      x: 200,
      y: 2050,
      w: 350,
      h: 900,
      railIndex: 0,
    })
    expect(layout.elements.get(id(21))).toMatchObject({ x: 900, y: 2050, w: 175, h: 900 })
  })

  it('rail blocks are one module wide and as tall as an element, centred on the rail line', () => {
    expect(layout.blocks.get(id(40))).toMatchObject({ x: 1600, y: 2050, w: 175, h: 900 })
    expect(layout.blocks.get(id(41))).toMatchObject({
      x: 200,
      y: 3050,
      w: 175,
      h: 900,
      railIndex: 1,
    })
  })

  it('outTop = last rail centre + ELEMENT_H/2 + CABLE_ROW_GAP; output wire points on the top edge', () => {
    expect(layout.outTop).toBe(3500 + 450 + 150)
    expect(layout.outputBoxes[0]).toMatchObject({ x: 200, y: 4100, w: 200, h: 250 })
    expect(layout.cableWires.get(id(5))?.pt).toEqual({ x: 300, y: 4100 })
    expect(layout.cableWires.get(id(5))).toMatchObject({ kind: 'output', cableId: id(4) })
  })

  it('drawing height = outTop + CABLE_BOX_H + MARGIN', () => {
    expect(layout.height).toBe(4100 + 250 + 200)
    expect(layout.width).toBe(10900)
  })

  it('every derived coordinate is an integer', () => {
    const numbers: number[] = [layout.railsTop, layout.outTop, layout.width, layout.height]
    for (const r of layout.rails) numbers.push(r.cy, r.x, r.y, r.w, r.h)
    for (const b of [...layout.elements.values(), ...layout.blocks.values()])
      numbers.push(b.x, b.y, b.w, b.h)
    for (const b of [...layout.inputBoxes, ...layout.outputBoxes]) {
      numbers.push(b.x, b.y, b.w, b.h)
      for (const w of b.wires) numbers.push(w.pt.x, w.pt.y)
    }
    expect(numbers.every(Number.isInteger)).toBe(true)
  })
})

describe('endpoint points', () => {
  const layout = computeLayout(buildWorld())

  it.each([
    ['E1 pole 0 input (top edge)', pole(id(20), 0, 'input'), { x: 288, y: 2050 }],
    ['E1 pole 1 output (bottom edge)', pole(id(20), 1, 'output'), { x: 463, y: 2950 }],
    ['E1 pole 0 output', pole(id(20), 0, 'output'), { x: 288, y: 2950 }],
    ['E2 single pole centred (87.5 -> 88)', pole(id(21), 0, 'input'), { x: 988, y: 2050 }],
    ['B1 contact 0, left (inset 25)', term(id(40), 0, 'left'), { x: 1625, y: 2088 }],
    ['B1 contact 1, right (inset 25)', term(id(40), 1, 'right'), { x: 1750, y: 2163 }],
    ['B1 contact 2, left (pitch 75)', term(id(40), 2, 'left'), { x: 1625, y: 2238 }],
    ['B2 contact 0, left', term(id(41), 0), { x: 225, y: 3088 }],
    ['B2 contact 1, right', term(id(41), 1, 'right'), { x: 350, y: 3163 }],
    ['input cable wire', cw(id(3)), { x: 400, y: 450 }],
    ['output cable wire', cw(id(5)), { x: 300, y: 4100 }],
  ])('%s', (_n, endpoint, expected) => {
    expect(endpointPoint(layout, endpoint)).toEqual(expected)
  })

  it.each([
    ['unknown element', pole(id(99), 0, 'input')],
    ['pole index past the count', pole(id(20), 2, 'input')],
    ['negative pole index', pole(id(20), -1, 'input')],
    ['unknown block', term(id(99), 0)],
    ['terminal index past the count', term(id(40), 3)],
    ['top side on a rail block', term(id(40), 0, 'top')],
    ['unknown cable wire', cw(id(99))],
  ])('returns null for %s', (_n, endpoint) => {
    expect(endpointPoint(layout, endpoint)).toBeNull()
  })

  it('directions: away from the body / cable box', () => {
    expect(endpointDirection(layout, pole(id(20), 0, 'input'))).toBe('up')
    expect(endpointDirection(layout, pole(id(20), 0, 'output'))).toBe('down')
    expect(endpointDirection(layout, term(id(40), 0, 'left'))).toBe('left')
    expect(endpointDirection(layout, term(id(40), 0, 'right'))).toBe('right')
    expect(endpointDirection(layout, cw(id(2)))).toBe('down')
    expect(endpointDirection(layout, cw(id(5)))).toBe('up')
    expect(endpointDirection(layout, pole(id(99), 0, 'input'))).toBeNull()
    expect(endpointDirection(layout, term(id(99), 0))).toBeNull()
    expect(endpointDirection(layout, cw(id(99)))).toBeNull()
  })
})

describe('sidesSwapped', () => {
  const swapped = content({
    rails: [rail(10, 24, 150, [element(20, 2, 3, 3, { sidesSwapped: true })])],
  })
  const layout = computeLayout(swapped)

  it('exchanges the edges: inputs at the bottom, outputs at the top', () => {
    expect(endpointPoint(layout, pole(id(20), 0, 'input'))).toEqual({ x: 638, y: 2950 })
    expect(endpointPoint(layout, pole(id(20), 0, 'output'))).toEqual({ x: 638, y: 2050 })
  })

  it('swaps the leave directions as well', () => {
    expect(endpointDirection(layout, pole(id(20), 1, 'input'))).toBe('down')
    expect(endpointDirection(layout, pole(id(20), 1, 'output'))).toBe('up')
  })

  it('keeps x of the pole (only the drawing edge changes)', () => {
    const normal = computeLayout(content({ rails: [rail(10, 24, 150, [element(20, 2, 3, 3)])] }))
    for (const i of [0, 1, 2]) {
      expect(endpointPoint(layout, pole(id(20), i, 'input'))?.x).toBe(
        endpointPoint(normal, pole(id(20), i, 'input'))?.x,
      )
    }
  })
})

describe('odd pole counts', () => {
  it('3 poles on a 3-module element at offset 2 sit at 638, 813, 988', () => {
    const layout = computeLayout(content({ rails: [rail(10, 24, 150, [element(20, 2, 3, 3)])] }))
    expect([0, 1, 2].map((i) => endpointPoint(layout, pole(id(20), i, 'input'))?.x)).toEqual([
      638, 813, 988,
    ])
  })

  it('3 poles on a 1-module element at offset 0: 229, 288, 346', () => {
    const layout = computeLayout(content({ rails: [rail(10, 24, 150, [element(20, 0, 1, 3)])] }))
    expect([0, 1, 2].map((i) => endpointPoint(layout, pole(id(20), i, 'input'))?.x)).toEqual([
      229, 288, 346,
    ])
  })

  it('a 2-module row block with 4 contacts at offset 4: x 944, 1031, 1119, 1206, top y 600, bottom y 850', () => {
    const layout = computeLayout(content({ terminalRow: [rowBlock(40, 4, 4)] }))
    expect([0, 1, 2, 3].map((i) => endpointPoint(layout, term(id(40), i, 'top'))?.x)).toEqual([
      944, 1031, 1119, 1206,
    ])
    expect(endpointPoint(layout, term(id(40), 0, 'top'))?.y).toBe(600)
    expect(endpointPoint(layout, term(id(40), 0, 'bottom'))).toEqual({ x: 944, y: 850 })
    expect(endpointPoint(layout, term(id(40), 0, 'left'))).toBeNull()
    expect(endpointDirection(layout, term(id(40), 0, 'top'))).toBe('up')
    expect(endpointDirection(layout, term(id(40), 0, 'bottom'))).toBe('down')
  })

  it('60 contacts on a 30-module row block are all integer points on the top edge', () => {
    const layout = computeLayout(content({ terminalRow: [rowBlock(40, 0, 60)] }))
    for (let i = 0; i < 60; i++) {
      const p = endpointPoint(layout, term(id(40), i, 'top'))
      expect(Number.isInteger(p?.x)).toBe(true)
      expect(p?.y).toBe(600)
    }
  })
})

describe('rail spacing and decimals', () => {
  it('spacingMm 150.3 converts to 1503 tenths and accumulates centre to centre', () => {
    const layout = computeLayout(
      content({ rails: [rail(10, 24, 150.3), rail(11, 24, 99.9), rail(12, 24, 0)] }),
    )
    expect(layout.rails.map((r) => r.cy)).toEqual([
      1000 + 1503,
      1000 + 1503 + 999,
      1000 + 1503 + 999,
    ])
    expect(layout.rails.every((r) => Number.isInteger(r.y))).toBe(true)
  })

  it('outTop follows the last rail even when it is the only one', () => {
    const layout = computeLayout(content({ rails: [rail(10, 24, 150)] }))
    expect(layout.outTop).toBe(2500 + 450 + 150)
    expect(layout.height).toBe(layout.outTop + 250 + 200)
  })
})

describe('cable rows', () => {
  it('boxes are laid out left to right in list order, separated by CABLE_GAP', () => {
    const layout = computeLayout(
      content({
        inputCables: [inputCable(1, [2, 3]), inputCable(4, [5]), inputCable(6, [7, 8, 9, 10])],
      }),
    )
    expect(layout.inputBoxes.map((b) => [b.x, b.w])).toEqual([
      [200, 300],
      [600, 200],
      [900, 500],
    ])
    expect(layout.cableWires.get(id(5))?.pt).toEqual({ x: 700, y: 450 }) // 600 + 50 + 0 + 50
    expect(layout.cableWires.get(id(10))?.pt).toEqual({ x: 900 + 50 + 300 + 50, y: 450 })
  })

  it('output boxes use the same left-to-right rule on the top edge of the output row', () => {
    const layout = computeLayout(
      content({ outputCables: [outputCable(4, [5, 6, 7]), outputCable(8, [9])] }),
    )
    expect(layout.outputBoxes.map((b) => [b.x, b.w, b.y])).toEqual([
      [200, 400, 1150],
      [700, 200, 1150],
    ])
    expect(layout.cableWires.get(id(9))?.pt).toEqual({ x: 800, y: 1150 })
  })

  it('20 four-wire input cables widen the drawing beyond 60 modules', () => {
    const cables = Array.from({ length: 20 }, (_, i) =>
      inputCable(100 + i, [200 + 4 * i, 201 + 4 * i, 202 + 4 * i, 203 + 4 * i]),
    )
    const layout = computeLayout(content({ inputCables: cables }))
    const rowWidth = 20 * 500 + 19 * 100
    expect(layout.width).toBe(2 * 200 + rowWidth)
    expect(layout.width).toBeGreaterThan(400 + 60 * 175)
  })

  it('a wide output row widens the drawing too', () => {
    const cables = Array.from({ length: 100 }, (_, i) => outputCable(100 + i, [400 + i]))
    const layout = computeLayout(content({ outputCables: cables }))
    expect(layout.width).toBe(400 + 100 * 200 + 99 * 100)
  })

  it('a rail wider than 60 modules (unvalidated input) widens the drawing', () => {
    const layout = computeLayout(content({ rails: [rail(10, 61)] }))
    expect(layout.width).toBe(400 + 61 * 175)
  })
})

describe('wirePolyline / viewBounds', () => {
  const world = buildWorld()
  const layout = computeLayout(world)

  it('draws start, bends verbatim, end', () => {
    const wire = panelWire(1, cw(id(2)), pole(id(20), 0, 'input'), [
      { x: 300, y: 1000 },
      { x: 288, y: 1000 },
    ])
    expect(wirePolyline(layout, wire)).toEqual([
      { x: 300, y: 450 },
      { x: 300, y: 1000 },
      { x: 288, y: 1000 },
      { x: 288, y: 2050 },
    ])
  })

  it('does not assume orthogonality (a diagonal bend is kept verbatim)', () => {
    const wire = panelWire(1, cw(id(2)), cw(id(3)), [{ x: 333, y: 777 }])
    expect(wirePolyline(layout, wire)).toEqual([
      { x: 300, y: 450 },
      { x: 333, y: 777 },
      { x: 400, y: 450 },
    ])
  })

  it('returns null when an endpoint is unknown', () => {
    expect(wirePolyline(layout, panelWire(1, cw(id(99)), cw(id(2))))).toBeNull()
    expect(wirePolyline(layout, panelWire(1, cw(id(2)), pole(id(20), 7, 'input')))).toBeNull()
  })

  it('view bounds equal the drawing box when all bends are inside', () => {
    expect(viewBounds(layout, world.wires)).toEqual({
      x: 0,
      y: 0,
      w: layout.width,
      h: layout.height,
    })
  })

  it('view bounds extend to bends outside the drawing', () => {
    const wire = panelWire(1, cw(id(2)), cw(id(3)), [
      { x: layout.width + 500, y: 100 },
      { x: 50, y: layout.height + 70 },
    ])
    expect(viewBounds(layout, [wire])).toEqual({
      x: 0,
      y: 0,
      w: layout.width + 500,
      h: layout.height + 70,
    })
  })
})

describe('styles', () => {
  it.each([
    ['1', 1.3],
    ['1.5', 1.3],
    ['2.5', 1.5],
    ['4', 1.8],
    ['6', 2.2],
  ] as const)('cross-section %s -> %d mm stroke', (cs, mm) => {
    expect(WIRE_STROKE_MM[cs]).toBe(mm)
  })

  it('palette and green-yellow overlay', () => {
    expect(WIRE_COLOUR_HEX).toEqual({
      black: '#1a1a1a',
      brown: '#7b4a1e',
      red: '#d32f2f',
      blue: '#1e5bd6',
      'green-yellow': '#2e9d3a',
    })
    expect(GREEN_YELLOW_OVERLAY).toEqual({ stroke: '#f2c200', dasharray: '3 3' })
  })

  it('short-circuit halo: wire width + 2 mm, #ff00ff at opacity 0.5', () => {
    expect(SHORT_CIRCUIT_HIGHLIGHT).toEqual({ colour: '#ff00ff', opacity: 0.5, extraWidthMm: 2 })
    expect(haloWidthMm('1')).toBeCloseTo(3.3, 10)
    expect(haloWidthMm('2.5')).toBeCloseTo(3.5, 10)
    expect(haloWidthMm('6')).toBeCloseTo(4.2, 10)
  })
})
