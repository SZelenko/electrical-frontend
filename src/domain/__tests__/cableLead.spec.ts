/** Auto-route of wires from outer cable lines: through the gaps of the inner lines, never inside a box. */
import { describe, expect, it } from 'vitest'
import { computeLayout, endpointPoint, type CableBox, type Layout, type Pt } from '../geometry'
import { MAX_BENDS_PER_WIRE, MAX_TOTAL_BENDS } from '../limits'
import { cableLead } from '../autoRoute'
import type { CableSide, Endpoint, OutputCable } from '../panelContent'
import { autoRouteFor } from '../routes'
import { convertLayout } from '../layoutConversion'
import { content, cw, element, id, inputCable, outputCable, pole, rail } from './helpers'

function outputs(count: number, wires: (i: number) => number): OutputCable[] {
  return Array.from({ length: count }, (_, i) => {
    const n = wires(i)
    return outputCable(
      100 + i,
      Array.from({ length: n }, (_, w) => 1000 + i * 10 + w),
    )
  })
}

/** The full polyline of an auto-routed wire from cable wire `wireId` to pole 0 of the device (real pole point). */
function polyline(layout: Layout, wireId: string, side: 'input' | 'output'): Pt[] {
  const start: Endpoint = cw(wireId)
  const end: Endpoint = pole(id(20), 0, side)
  const bends = autoRouteFor(layout, { start, end })
  const from = endpointPoint(layout, start)
  const to = endpointPoint(layout, end)
  if (!bends || !from || !to) throw new Error('no route')
  return [from, ...bends, to]
}

/** True when the segment passes through the open interior of the box (touching the border is allowed). */
function crosses(a: Pt, b: Pt, box: CableBox): boolean {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return x1 > box.x && x0 < box.x + box.w && y1 > box.y && y0 < box.y + box.h
}

const scene = (output: CableSide, input: CableSide, count: number, perWire = 4) =>
  content({
    railWidthModules: 10,
    inputCableSide: input,
    outputCableSide: output,
    inputCables: [inputCable(1, [2])],
    outputCables: outputs(count, () => perWire),
    rails: [rail(10, 10, 100, [element(20, 4, 2, 2)])],
  })

describe('wrapped lines: the route passes the inner lines through gaps, never through a box', () => {
  // 5 four-wire boxes fit one top/bottom line of 10 modules; 9 outputs -> 2 lines
  it.each<[CableSide, CableSide, 'input' | 'output']>([
    ['top', 'left', 'input'],
    ['bottom', 'top', 'output'],
    ['left', 'top', 'input'],
    ['right', 'top', 'input'],
  ])('%s outputs: no route segment enters another cable box', (side, inputSide, poleSide) => {
    const layout = computeLayout(scene(side, inputSide, 9))
    const lines = new Set(layout.outputBoxes.map((b) => b.line))
    expect(lines.size).toBeGreaterThanOrEqual(2)
    let checked = 0
    for (const own of layout.outputBoxes.filter((b) => b.line === 0)) {
      for (const w of own.wires) {
        const pts = polyline(layout, w.id, poleSide)
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i] as Pt
          const b = pts[i + 1] as Pt
          for (const box of layout.cableBoxes) {
            if (box.id === own.id) continue
            expect(crosses(a, b, box), `wire ${w.id} segment ${i} enters box ${box.id}`).toBe(false)
          }
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it.each<CableSide>(['top', 'bottom', 'left', 'right'])(
    '%s: the lead of an outer wire has orthogonal steps and ends past the innermost line',
    (side) => {
      const input: CableSide = side === 'top' ? 'left' : 'top'
      const layout = computeLayout(scene(side, input, 9))
      const own = layout.outputBoxes.find((b) => b.line === 0)!
      const lead = cableLead(layout, own.wires[0]!.id)
      expect(lead.length).toBeGreaterThanOrEqual(3)
      const all = [layout.cableWires.get(own.wires[0]!.id)!.pt, ...lead]
      for (let i = 0; i + 1 < all.length; i++) {
        const a = all[i] as Pt
        const b = all[i + 1] as Pt
        expect(a.x === b.x || a.y === b.y).toBe(true)
      }
    },
  )

  it('a wire of the inner line (and of a single-line side) has no lead', () => {
    const layout = computeLayout(scene('top', 'left', 9))
    const inner = layout.outputBoxes.find((b) => b.line === 1)!
    expect(cableLead(layout, inner.wires[0]!.id)).toEqual([])
    const single = computeLayout(scene('top', 'left', 2))
    expect(cableLead(single, single.outputBoxes[0]!.wires[0]!.id)).toEqual([])
  })

  it('an unknown cable wire id has no lead', () => {
    expect(cableLead(computeLayout(scene('top', 'left', 9)), id(999))).toEqual([])
  })

  it('a bottom input wire crosses the output band through its gaps, never through an output box', () => {
    const layout = computeLayout(scene('bottom', 'bottom', 9))
    expect(Math.max(...layout.outputBoxes.map((b) => b.line))).toBeGreaterThanOrEqual(1)
    for (const w of layout.inputBoxes.flatMap((b) => b.wires)) {
      const pts = polyline(layout, w.id, 'output')
      for (let i = 0; i + 1 < pts.length; i++) {
        for (const box of layout.outputBoxes) {
          expect(
            crosses(pts[i] as Pt, pts[i + 1] as Pt, box),
            `segment ${i} enters ${box.id}`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('bottom inputs and outputs share the band (the mirror of the top)', () => {
  // inputs 50, 400, 750 (end 1000) on line 0; the output zone is [1200, 1950]: seven 2-wire outputs (150)
  // take 3 + 3 + 1 per line, the 4-wire one (250) follows the seventh on line 2
  const c = content({
    railWidthModules: 10,
    inputCableSide: 'bottom',
    outputCableSide: 'bottom',
    inputCables: Array.from({ length: 4 }, (_, i) =>
      inputCable(
        200 + i,
        Array.from({ length: 4 }, (_, w) => 2000 + i * 10 + w),
      ),
    ),
    outputCables: outputs(8, (i) => (i < 7 ? 2 : 4)),
    rails: [rail(10, 10, 100, [element(20, 4, 2, 2)])],
  })
  const layout = computeLayout(c)

  it('the scenario: inputs wrap at half the sheet, outputs start 200 after them on every line', () => {
    expect(layout.inputBoxes.map((b) => [b.line, b.x])).toEqual([
      [0, 50],
      [0, 400],
      [0, 750],
      [1, 50],
    ])
    expect(layout.outputBoxes.map((b) => [b.line, b.x])).toEqual([
      // before the right alignment: 1200, 1450, 1700 / 1200, 1450, 1700 / 1200, 1450; every line is then
      // shifted so that its last box ends at spanEnd 1950 (by 100, 100 and 250)
      [0, 1300],
      [0, 1550],
      [0, 1800],
      [1, 1300],
      [1, 1550],
      [1, 1800],
      [2, 1450],
      [2, 1700],
    ])
    // all boxes of a line share its y: line 0 at the sheet edge, line k above it by k * 400
    const y0 = layout.inputBoxes[0]!.y
    expect(layout.outputBoxes.map((b) => b.y)).toEqual(
      layout.outputBoxes.map((b) => y0 - b.line * 400),
    )
    expect(layout.inputBoxes[3]!.y).toBe(y0 - 400)
    expect(layout.bandTop + 3 * 250 + 2 * 150 - 250).toBe(y0)
  })

  it('every input wire leads through the gaps of all inner lines of the side, outputs included', () => {
    for (const box of layout.inputBoxes) {
      for (const w of box.wires) {
        const lead = cableLead(layout, w.id)
        const inner = layout.cableBoxes.filter((b) => b.side === 'bottom' && b.line > box.line)
        // the wrapped input (line 1) has line-2 outputs inside it; line-0 inputs have lines 1 and 2
        expect(lead.length > 0).toBe(inner.length > 0)
        const pts = [w.pt, ...lead]
        for (let i = 0; i + 1 < pts.length; i++) {
          for (const other of inner) {
            expect(crosses(pts[i] as Pt, pts[i + 1] as Pt, other)).toBe(false)
          }
        }
      }
    }
  })

  it('no segment of any input wire enters any output box', () => {
    for (const w of layout.inputBoxes.flatMap((b) => b.wires)) {
      const pts = polyline(layout, w.id, 'output')
      for (let i = 0; i + 1 < pts.length; i++) {
        for (const box of layout.outputBoxes) {
          expect(
            crosses(pts[i] as Pt, pts[i + 1] as Pt, box),
            `wire ${w.id} segment ${i} enters ${box.id}`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('exact leads (hand-derived, tenths of a mm)', () => {
  const fourWire = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      inputCable(
        200 + i,
        Array.from({ length: 4 }, (_, w) => 2000 + i * 10 + w),
      ),
    )

  // 10 modules: W0 = 200 + 1750 + 200 = 2150, inputLimit 1075; 4-wire inputs (250) at 50, 400, 750, the 4th
  // would end at 1350 and wraps to line 1 at x 50..300 (line 0 y 50..300, line 1 y 450..700)
  it('top: a wrapped input line is crossed to the right of its box, never along the sheet edge (x = 0)', () => {
    const layout = computeLayout(
      content({
        railWidthModules: 10,
        inputCableSide: 'top',
        outputCableSide: 'bottom',
        inputCables: fourWire(4),
      }),
    )
    expect(layout.inputBoxes.map((b) => [b.line, b.x, b.y])).toEqual([
      [0, 50, 50],
      [0, 400, 50],
      [0, 750, 50],
      [1, 50, 450],
    ])
    const wire = layout.inputBoxes[0]!.wires[0]!
    expect(wire.pt).toEqual({ x: 100, y: 300 })
    // 100 lies inside the line-1 box [50, 300]; the candidate before it would be 50 - 50 = 0 < SHEET_INSET
    // and is not offered, so the nearest gap is past its end: 300 + 50 = 350
    expect(cableLead(layout, wire.id)).toEqual([
      { x: 100, y: 375 }, // half a line gap (75) below the wire point
      { x: 350, y: 375 }, // sideways to the gap past the end
      { x: 350, y: 700 }, // down through line 1 (450..700)
    ])
    // none of the leads of the line-0 wires touches the sheet border
    for (const w of layout.inputBoxes.slice(0, 3).flatMap((b) => b.wires)) {
      for (const p of cableLead(layout, w.id)) expect(p.x).toBeGreaterThanOrEqual(50)
    }
  })

  it('bottom: the same wrapped input line, mirrored (the band is lowest at line 0, going up)', () => {
    const layout = computeLayout(
      content({
        railWidthModules: 10,
        inputCableSide: 'bottom',
        outputCableSide: 'top',
        inputCables: fourWire(4),
      }),
    )
    // no rails, top empty: railsTop 600 = sideBottom, bottomRowY 750, bandTop 1150, depth 650:
    // line 0 y 1550..1800, line 1 y 1150..1400
    expect(layout.bandTop).toBe(1150)
    const wire = layout.inputBoxes[0]!.wires[0]!
    expect(wire.pt).toEqual({ x: 100, y: 1550 })
    expect(cableLead(layout, wire.id)).toEqual([
      { x: 100, y: 1475 },
      { x: 350, y: 1475 },
      { x: 350, y: 1150 },
    ])
  })

  // top outputs only (inputs on the bottom): zone = span [200, 1950]; o0 is 3 wires (200..400), then 2-wire
  // boxes at 500, 750, 1050, 1350, 1650; the 4-wire o6 wraps to line 1 at 200..450, the 2-wire o7 follows at 550..700
  describe('a line-0 output wire over a line-1 box', () => {
    const c = content({
      railWidthModules: 10,
      inputCableSide: 'bottom',
      outputCableSide: 'top',
      inputCables: [inputCable(1, [2, 3])],
      outputCables: outputs(8, (i) => (i === 0 ? 3 : i === 6 ? 4 : 2)),
    })
    const layout = computeLayout(c)

    it('the scenario', () => {
      const line1 = layout.outputBoxes.filter((b) => b.line === 1)
      expect(line1.map((b) => [b.x, b.w])).toEqual([
        [200, 250],
        [550, 150],
      ])
      expect(layout.outputBoxes[0]).toMatchObject({ x: 200, y: 200, w: 200, line: 0 })
      // line 0 wires of o0: x = 200 + 25 + 25 i + 25 = 250, 300, 350, on y 450
      expect(layout.outputBoxes[0]!.wires.map((w) => w.pt)).toEqual([
        { x: 250, y: 450 },
        { x: 300, y: 450 },
        { x: 350, y: 450 },
      ])
    })

    it('x = 350 is nearer the centre of the gap (450, 550) = 500 than the gap before the first box (150)', () => {
      const w = layout.outputBoxes[0]!.wires[2]!
      expect(cableLead(layout, w.id)).toEqual([
        { x: 350, y: 525 }, // half a line gap (75) below the wire point at y 450
        { x: 500, y: 525 }, // jog to the gap centre
        { x: 500, y: 850 }, // down through line 1 (600..850)
      ])
    })

    it('x = 250 is nearer the gap before the first box: 200 - 50 = 150', () => {
      const w = layout.outputBoxes[0]!.wires[0]!
      expect(cableLead(layout, w.id)).toEqual([
        { x: 250, y: 525 },
        { x: 150, y: 525 },
        { x: 150, y: 850 },
      ])
    })

    it('a wire that already has room in a gap keeps its x (25 u clear on both sides)', () => {
      // o2 is the 2-wire box at 750..900: its wire 0 at x = 800 is 100 past the line-1 box [550, 700]
      const o2 = layout.outputBoxes[2]!
      expect(o2.x).toBe(750)
      expect(o2.wires[0]!.pt.x).toBe(800)
      expect(cableLead(layout, o2.wires[0]!.id).map((p) => p.x)).toEqual([800, 800])
    })
  })

  // shared bottom band, 10 modules: inputs 50, 400, 750 (end 1000); zone [1200, 1950]; 2-wire outputs at
  // 1200, 1450, 1700 on line 0 and the fourth wraps to line 1 at 1200..1350; the right alignment to
  // spanEnd 1950 then moves line 0 by 100 (1300, 1550, 1800) and line 1 by 600 (1800..1950)
  describe('shared bottom band', () => {
    const layout = computeLayout(
      content({
        railWidthModules: 10,
        inputCableSide: 'bottom',
        outputCableSide: 'bottom',
        inputCables: fourWire(3),
        outputCables: outputs(4, () => 2),
      }),
    )

    it('the scenario: line 0 at y 1550, line 1 at y 1150', () => {
      expect(layout.outputBoxes.map((b) => [b.line, b.x, b.y])).toEqual([
        [0, 1300, 1550],
        [0, 1550, 1550],
        [0, 1800, 1550],
        [1, 1800, 1150],
      ])
    })

    it('an output wire under the shifted line-1 box jogs to the gap before it (1750)', () => {
      const w = layout.outputBoxes[2]!.wires[0]!
      expect(w.pt).toEqual({ x: 1850, y: 1550 })
      // the line-1 box is [1800, 1950]: candidates 1800 - 50 = 1750 (100 away) and 1950 + 50 = 2000 (150 away)
      expect(cableLead(layout, w.id)).toEqual([
        { x: 1850, y: 1475 },
        { x: 1750, y: 1475 },
        { x: 1750, y: 1150 },
      ])
    })

    it('a wire left of the shifted line-1 box (x <= 1800 - 25) goes straight through', () => {
      const w = layout.outputBoxes[1]!.wires[0]!
      expect(w.pt).toEqual({ x: 1600, y: 1550 })
      expect(cableLead(layout, w.id)).toEqual([
        { x: 1600, y: 1475 },
        { x: 1600, y: 1150 },
      ])
    })

    it('an input wire is clear of the zone: it goes straight through line 1 too', () => {
      const w = layout.inputBoxes[1]!.wires[0]!
      expect(w.pt).toEqual({ x: 450, y: 1550 })
      expect(cableLead(layout, w.id)).toEqual([
        { x: 450, y: 1475 },
        { x: 450, y: 1150 },
      ])
    })
  })
})

describe('worst case: 100 outputs on a 1-module rail', () => {
  const big = content({
    railWidthModules: 1,
    inputCableSide: 'left',
    outputCableSide: 'top',
    inputCables: [inputCable(1, [2, 3])],
    outputCables: outputs(100, (i) => (i % 4) + 1),
    rails: [rail(10, 1, 100, [element(20, 0, 1, 1)])],
  })

  it('every auto-routed wire from a line-0 output and an input stays within the bend caps, quickly', () => {
    const started = performance.now()
    const layout = computeLayout(big)
    // the panel really is pathological: a 1-module span wraps nearly every box onto its own line
    expect(Math.max(...layout.outputBoxes.map((b) => b.line))).toBeGreaterThan(20)
    let total = 0
    let worst = 0
    const sources = [
      ...layout.outputBoxes.filter((b) => b.line === 0).flatMap((b) => b.wires),
      ...layout.inputBoxes.flatMap((b) => b.wires),
    ]
    expect(sources.length).toBeGreaterThan(0)
    for (const w of sources) {
      const bends = autoRouteFor(layout, { start: cw(w.id), end: pole(id(20), 0, 'input') })!
      worst = Math.max(worst, bends.length)
      total += bends.length
    }
    expect(worst, 'bends of the worst wire').toBeLessThanOrEqual(MAX_BENDS_PER_WIRE)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BENDS)
    expect(performance.now() - started).toBeLessThan(5000)
  })

  it('converting such a v1 panel stays within the bend caps, quickly', () => {
    const v1 = {
      ...big,
      layoutVersion: 1 as const,
      wires: [
        ...big.outputCables.slice(0, 100).map((o, i) => ({
          id: id(5000 + i),
          colour: 'brown' as const,
          crossSection: '2.5' as const,
          start: cw(o.wires[0]!.id),
          end: pole(id(20), 0, 'input'),
          bends: [],
        })),
        {
          id: id(4999),
          colour: 'brown' as const,
          crossSection: '2.5' as const,
          start: cw(id(2)),
          end: pole(id(20), 0, 'input'),
          bends: [],
        },
      ],
    }
    const started = performance.now()
    const out = convertLayout(v1)
    const counts = out.content.wires.map((w) => w.bends.length)
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_BENDS_PER_WIRE)
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_TOTAL_BENDS)
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
