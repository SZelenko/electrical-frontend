/**
 * Compact cable layout (`layoutVersion` 2): hand-derived values in tenths of a millimetre from the
 * panel-domain formulas. len(n) = 50 + 50n (1 wire 100, 2 wires 150, 3 wires 200, 4 wires 250);
 * MARGIN 200, SHEET_INSET 50, box depth 250, gap 100, row gap 150, module 175.
 */
import { describe, expect, it } from 'vitest'
import {
  CABLE_BOX_H,
  CABLE_LINE_GAP,
  SHEET_INSET,
  bandDepth,
  cableBoxWidth,
  computeLayout,
  type CableBox,
  type Layout,
} from '../geometry'
import type { CableSide, OutputCable, PanelContent } from '../panelContent'
import { content, id, inputCable, outputCable, rail } from './helpers'

/** `count` outputs with `wires` wires each (ids 100.., wires 1000..). */
function outputs(count: number, wires: number): OutputCable[] {
  return Array.from({ length: count }, (_, i) =>
    outputCable(
      100 + i,
      Array.from({ length: wires }, (_, w) => 1000 + i * 10 + w),
    ),
  )
}

/** `count` inputs with `wires` wires each (ids 200.., wires 2000..). */
function inputs(count: number, wires: number) {
  return Array.from({ length: count }, (_, i) =>
    inputCable(
      200 + i,
      Array.from({ length: wires }, (_, w) => 2000 + i * 10 + w),
    ),
  )
}

const panel = (input: CableSide, output: CableSide, over: Partial<PanelContent> = {}) =>
  content({ inputCableSide: input, outputCableSide: output, railWidthModules: 24, ...over })

const box = (layout: Layout, cableId: string): CableBox => {
  const found = layout.cableBoxes.find((b) => b.id === cableId)
  if (!found) throw new Error(`no box ${cableId}`)
  return found
}
const place = (b: CableBox) => ({ x: b.x, y: b.y, line: b.line })

describe('cable box length and band depth', () => {
  it.each([
    [1, 100],
    [2, 150],
    [3, 200],
    [4, 250],
  ])('%i wires -> %i u', (n, len) => expect(cableBoxWidth(n)).toBe(len))

  it.each([
    [0, 0],
    [1, 250],
    [2, 650],
    [3, 1050],
  ])('%i lines -> depth %i u', (n, depth) => expect(bandDepth(n)).toBe(depth))
})

describe('inputs stand at SHEET_INSET from the sheet edge and corner', () => {
  const rails = [rail(10, 24, 150)]

  it('top: x = y = 50; wire points on the bottom edge', () => {
    const l = computeLayout(panel('top', 'bottom', { inputCables: inputs(1, 2), rails }))
    expect(box(l, id(200))).toMatchObject({ x: 50, y: 50, w: 150, h: 250, side: 'top', line: 0 })
    expect(l.cableWires.get(id(2000))?.pt).toEqual({ x: 100, y: 300 })
    expect(l.cableWires.get(id(2001))?.pt).toEqual({ x: 150, y: 300 })
    // railsLeft = MARGIN, topRowY = 50 + 250 + 150, railsTop = 450 + 250 + 150
    expect([l.railsLeft, l.topRowY, l.railsTop]).toEqual([200, 450, 850])
    // rail cy 2350, bottom 2800, bottomRowY 2950 (no bottom cables): height = bottomRowY + 250 + MARGIN
    expect([l.bottomRowY, l.height]).toEqual([2950, 2950 + 250 + 200])
    expect(l.width).toBe(200 + 24 * 175 + 200)
  })

  it('left: x = y = 50; wire points on the right edge; railsLeft = 50 + 250 + 150', () => {
    const l = computeLayout(panel('left', 'bottom', { inputCables: inputs(1, 2), rails }))
    expect(box(l, id(200))).toMatchObject({ x: 50, y: 50, w: 250, h: 150, side: 'left', line: 0 })
    expect(l.cableWires.get(id(2000))?.pt).toEqual({ x: 300, y: 100 })
    expect(l.cableWires.get(id(2001))?.pt).toEqual({ x: 300, y: 150 })
    // top has no cables: top margin MARGIN, topRowY 200, railsTop 600
    expect([l.railsLeft, l.topRowY, l.railsTop]).toEqual([450, 200, 600])
    expect(l.width).toBe(450 + 24 * 175 + 200)
  })

  it('right: the box ends exactly 5 mm (50 u) from the right edge; wire points on the left edge', () => {
    const l = computeLayout(panel('right', 'bottom', { inputCables: inputs(1, 2), rails }))
    // railsRight 200 + 4200; the band starts 150 further, depth 250
    expect(box(l, id(200))).toMatchObject({ x: 4550, y: 50, w: 250, h: 150, side: 'right' })
    expect(l.cableWires.get(id(2000))?.pt).toEqual({ x: 4550, y: 100 })
    expect(l.width).toBe(4400 + 150 + 250 + 50)
    expect(l.width - (box(l, id(200)).x + box(l, id(200)).w)).toBe(SHEET_INSET)
  })

  it('bottom: the band is below the bottom terminal row, x = 50, 50 above the sheet bottom', () => {
    const l = computeLayout(panel('bottom', 'top', { inputCables: inputs(1, 2), rails }))
    // top empty: topRowY 200, railsTop 600, cy 2100, bottom 2550, bottomRowY 2700
    expect([l.topRowY, l.railsTop, l.bottomRowY]).toEqual([200, 600, 2700])
    expect(l.bandTop).toBe(2700 + 250 + 150)
    expect(box(l, id(200))).toMatchObject({ x: 50, y: 3100, w: 150, h: 250, side: 'bottom' })
    // wire points on the top edge of the box
    expect(l.cableWires.get(id(2000))?.pt).toEqual({ x: 100, y: 3100 })
    expect(l.height).toBe(3100 + 250 + 50)
    expect(l.height - (box(l, id(200)).y + box(l, id(200)).h)).toBe(SHEET_INSET)
  })

  it('several inputs are separated by CABLE_GAP and wrap at half the sheet width', () => {
    // 10 modules: W0 = 200 + 1750 + 200 = 2150, inputLimit 1075; 4-wire boxes are 250 long:
    // 50..300, 400..650, 750..1000 fit, a fourth would end at 1350 > 1075 -> next line
    const l = computeLayout(
      panel('top', 'bottom', { railWidthModules: 10, inputCables: inputs(8, 4), rails }),
    )
    expect(l.inputBoxes.map((b) => [b.x, b.line])).toEqual([
      [50, 0],
      [400, 0],
      [750, 0],
      [50, 1],
      [400, 1],
      [750, 1],
      [50, 2],
      [400, 2],
    ])
    expect(l.width).toBe(200 + 1750 + 200) // wrapping, not widening
  })

  it('an input that ends exactly at the limit stays on its line; one grid step (50 u) past it wraps', () => {
    // 8 modules: W0 = 200 + 1400 + 200 = 1800, inputLimit 900. Box lengths are multiples of 50 u, so the
    // end of a box can hit the limit exactly but never lie 1 u past it.
    const at = (wires: number[]) =>
      computeLayout(
        panel('top', 'bottom', {
          railWidthModules: 8,
          inputCables: wires.map((n, i) =>
            inputCable(
              200 + i,
              Array.from({ length: n }, (_, w) => 2000 + i * 10 + w),
            ),
          ),
        }),
      )
    // 4 + 3 + 3 wires: 50..300, 400..600, 700..900 -> the last ends at exactly 900 = limit: stays on line 0
    const exact = at([4, 3, 3])
    expect(exact.inputBoxes.map((b) => [b.x, b.x + b.w, b.line])).toEqual([
      [50, 300, 0],
      [400, 600, 0],
      [700, 900, 0],
    ])
    // 4 + 4 + 3 wires: 50..300, 400..650, 750..950 -> ends 50 u past the limit: wraps to line 1 at x 50
    const past = at([4, 4, 3])
    expect(past.inputBoxes.map((b) => [b.x, b.line])).toEqual([
      [50, 0],
      [400, 0],
      [50, 1],
    ])
  })

  it('an input longer than the limit sits alone on its line', () => {
    // 1 module: W0 = 200 + 175 + 200 = 575, limit 287; a 4-wire input is 250: 50..300 > 287 but alone
    const l = computeLayout(
      panel('top', 'bottom', { railWidthModules: 1, inputCables: inputs(2, 4) }),
    )
    expect(l.inputBoxes.map((b) => [b.x, b.line])).toEqual([
      [50, 0],
      [50, 1],
    ])
  })
})

describe('output zone beyond the rail span', () => {
  it('zoneStart > spanEnd: every output sits alone at zoneStart, one per line, and the sheet grows', () => {
    // 1 module: span [200, 375]; the input (2 wires) ends at 200, zoneStart = max(200, 200 + 200) = 400 > 375
    const l = computeLayout(
      panel('top', 'top', {
        railWidthModules: 1,
        inputCables: inputs(1, 2),
        outputCables: outputs(2, 1),
      }),
    )
    expect(l.inputBoxes.map((b) => [b.x, b.line])).toEqual([[50, 0]])
    expect(l.outputBoxes.map((b) => [b.x, b.line])).toEqual([
      [400, 0],
      [400, 1],
    ])
    // W0 = 200 + 175 + 200 = 575; the box ends at 500, + MARGIN 200 = 700
    expect(l.width).toBe(700)
  })
})

describe('the input limit W0 includes the right band', () => {
  // inputs on top, outputs on the right: 10 modules, railsRight 1950; three 4-wire outputs wrap to 2 lines
  // in the 900 high rails area (2 + 1), so D_right = 2 * 250 + 100 = 600 and
  // W0 = 1950 + 150 + 600 + 200 = 2900, inputLimit = 1450
  const withInputs = (wires: number, count: number) =>
    computeLayout(
      panel('top', 'right', {
        railWidthModules: 10,
        inputCables: Array.from({ length: count }, (_, i) =>
          inputCable(
            200 + i,
            Array.from({ length: wires }, (_, w) => 2000 + i * 10 + w),
          ),
        ),
        outputCables: outputs(3, 4),
      }),
    )

  it('the right band is two lines deep', () => {
    const l = withInputs(3, 1)
    expect(new Set(l.outputBoxes.map((b) => b.line))).toEqual(new Set([0, 1]))
    expect(l.width).toBe(2950)
  })

  it('five 3-wire inputs end exactly at the limit 1450 and stay on line 0', () => {
    // 50 + 5 * 200 + 4 * 100 = 1450
    const l = withInputs(3, 5)
    expect(l.inputBoxes.map((b) => [b.x, b.line])).toEqual([
      [50, 0],
      [350, 0],
      [650, 0],
      [950, 0],
      [1250, 0],
    ])
    expect(l.inputBoxes[4]!.x + l.inputBoxes[4]!.w).toBe(1450)
    expect(l.width).toBe(2950)
  })

  it('a sixth input would end past 1450 and wraps to line 1', () => {
    const l = withInputs(3, 6)
    expect(l.inputBoxes.map((b) => b.line)).toEqual([0, 0, 0, 0, 0, 1])
    expect(l.inputBoxes[5]!.x).toBe(50)
  })
})

describe('bottom side: rails, bottom terminal row, cable band (the mirror of the top)', () => {
  it('outputs form the band below the bottom row', () => {
    const l = computeLayout(
      panel('top', 'bottom', { outputCables: outputs(1, 1), rails: [rail(10, 24, 150)] }),
    )
    // rails bottom 2800, bottomRowY 2950, bandTop 3350, one line: box y = 3350 + 250 - 250
    expect(l.bottomRowY).toBe(2950)
    expect(l.bandTop).toBe(3350)
    expect(box(l, id(100))).toMatchObject({ x: 200, y: 3350, w: 100, h: 250, side: 'bottom' })
    expect(l.cableWires.get(id(1000))?.pt).toEqual({ x: 250, y: 3350 })
    expect(l.height).toBe(3350 + 250 + 200)
  })

  it('inputs and outputs both on the bottom share line 0, outputs after the inputs plus IO_GAP', () => {
    const l = computeLayout(
      panel('bottom', 'bottom', {
        inputCables: inputs(1, 2),
        outputCables: outputs(1, 1),
        rails: [rail(10, 24, 150)],
      }),
    )
    // top empty: railsTop 600; cy 2100, rails bottom 2550
    expect(l.railsTop).toBe(600)
    expect(l.bottomRowY).toBe(2550 + 150)
    expect(l.bandTop).toBe(2700 + 250 + 150)
    expect(box(l, id(200))).toMatchObject({ x: 50, y: 3100, line: 0 })
    // the input ends at 200: the output zone starts at 400 (IO_GAP 200), line 0 as well; the shared side
    // right-aligns the line to the rail end 200 + 24 * 175 = 4400: a 100 u box starts at 4300
    expect(box(l, id(100))).toMatchObject({ x: 4300, y: 3100, line: 0 })
    expect(l.height).toBe(3100 + 250 + 50) // m_bottom = SHEET_INSET (input side)
  })

  it('a wrapped band: line 0 is the outermost (lowest), line 1 lies inwards, band depth 2*250 + 150', () => {
    // 6 boxes of 250 in a 1750 span [200, 1950]: five fit (the fifth ends exactly at 1950), the sixth wraps
    const l = computeLayout(
      panel('top', 'bottom', { railWidthModules: 10, outputCables: outputs(6, 4) }),
    )
    const xs = l.outputBoxes.map((b) => b.x)
    expect(xs).toEqual([200, 550, 900, 1250, 1600, 200])
    expect(l.outputBoxes.map((b) => b.line)).toEqual([0, 0, 0, 0, 0, 1])
    // no rails: railsTop 850 = sideBottom; bottomRowY 1000; bandTop 1400; depth 650
    expect(l.bottomRowY).toBe(1000)
    expect(l.bandTop).toBe(1400)
    expect(box(l, id(100)).y).toBe(1400 + 650 - 250)
    expect(box(l, id(105)).y).toBe(1400)
    expect(l.cableWires.get(id(1050))?.pt).toEqual({ x: 250, y: 1400 })
    expect(l.height).toBe(1400 + 650 + 200)
  })
})

describe('output wrapping', () => {
  it('top, shared with an input: outputs start IO_GAP after the inputs on every line and wrap at the span end', () => {
    // span [200, 1950]; the input ends at 200: the output zone is [400, 1950]
    const l = computeLayout(
      panel('top', 'top', {
        railWidthModules: 10,
        inputCables: inputs(1, 2),
        outputCables: outputs(6, 4),
      }),
    )
    expect(l.outputBoxes.map(place)).toEqual([
      // line 0 is 400, 750, 1100, 1450 before the shift (the next would end at 2050 > 1950; line 1 also
      // starts at the zone start 400, not at the span start); each line then moves right so that its
      // last box ends at spanEnd 1950: line 0 by 250, line 1 (400, 750; ends at 1000) by 950
      { x: 650, y: 50, line: 0 },
      { x: 1000, y: 50, line: 0 },
      { x: 1350, y: 50, line: 0 },
      { x: 1700, y: 50, line: 0 },
      { x: 1350, y: 450, line: 1 },
      { x: 1700, y: 450, line: 1 },
    ])
    // two lines: depth 650 (line pitch 250 + CABLE_LINE_GAP 150); topRowY = 50 + 650 + 150, railsTop = 850 + 250 + 150
    expect([l.topRowY, l.railsTop]).toEqual([850, 1250])
    expect(l.cableWires.get(id(1050))?.pt).toEqual({ x: 1750, y: 700 })
    expect(l.cableWires.get(id(1000))?.pt).toEqual({ x: 700, y: 300 })
  })

  describe('right alignment on a shared top/bottom side', () => {
    it.each(['top', 'bottom'] as const)(
      '%s: every output line ends exactly at railsRight and keeps its order',
      (side) => {
        // 10 modules: railsRight 1950; mixed box lengths (1 to 4 wires) wrap onto at least three lines
        const l = computeLayout(
          panel(side, side, {
            railWidthModules: 10,
            inputCables: inputs(1, 2),
            outputCables: Array.from({ length: 16 }, (_, i) =>
              outputCable(
                100 + i,
                Array.from({ length: 1 + (i % 4) }, (_, w) => 1000 + i * 10 + w),
              ),
            ),
          }),
        )
        const lines = new Set(l.outputBoxes.map((b) => b.line))
        expect(lines.size).toBeGreaterThanOrEqual(3)
        for (const line of lines) {
          const onLine = l.outputBoxes.filter((b) => b.line === line)
          expect(Math.max(...onLine.map((b) => b.x + b.w))).toBe(l.railsLeft + 10 * 175)
          // left to right in list order, CABLE_GAP apart
          for (let i = 1; i < onLine.length; i++) {
            expect(onLine[i]!.x).toBe(onLine[i - 1]!.x + onLine[i - 1]!.w + 100)
          }
        }
        // «Вих 1» is first on line 0, the numbers grow along the lines
        expect(l.outputBoxes.map((b) => b.index)).toEqual(l.outputBoxes.map((_, i) => i))
        expect(l.outputBoxes.map((b) => b.line)).toEqual(
          [...l.outputBoxes.map((b) => b.line)].sort((a, b) => a - b),
        )
        // the free space lies between the inputs and the outputs: the zone start is only a lower bound
        for (const b of l.outputBoxes) expect(b.x).toBeGreaterThanOrEqual(200 + 200)
      },
    )

    it('a lone over-long box is not shifted: it stays at zoneStart and runs past the rail end', () => {
      // 1 module: railsRight 375; the input (2 wires) ends at 200 -> zoneStart max(200, 400) = 400;
      // a 4-wire box (250) ends at 650 > 375
      const l = computeLayout(
        panel('top', 'top', {
          railWidthModules: 1,
          inputCables: inputs(1, 2),
          outputCables: outputs(1, 4),
        }),
      )
      expect(box(l, id(100))).toMatchObject({ x: 400, line: 0 })
    })

    it('outputs alone on their side stay left-aligned at the rail start', () => {
      const l = computeLayout(
        panel('top', 'bottom', { railWidthModules: 10, outputCables: outputs(3, 2) }),
      )
      expect(l.outputBoxes.map((b) => b.x)).toEqual([200, 450, 700])
      const top = computeLayout(
        panel('bottom', 'top', { railWidthModules: 10, outputCables: outputs(3, 2) }),
      )
      expect(top.outputBoxes.map((b) => b.x)).toEqual([200, 450, 700])
    })
  })

  it('top: wide inputs wrap at half the sheet; the outputs use the zone after the widest input line', () => {
    // 4 modules: W0 = 1100, limit 550; each 4-wire input (250) is alone on its line (50..300)
    const l = computeLayout(
      panel('top', 'top', {
        railWidthModules: 4,
        inputCables: inputs(4, 4),
        outputCables: outputs(2, 1),
      }),
    )
    expect(l.inputBoxes.map(place)).toEqual([
      { x: 50, y: 50, line: 0 },
      { x: 50, y: 450, line: 1 },
      { x: 50, y: 850, line: 2 },
      { x: 50, y: 1250, line: 3 },
    ])
    // zoneStart = max(200, 300 + 200) = 500; span end 900: 500..600 and 700..800, then shifted by 100
    expect(l.outputBoxes.map(place)).toEqual([
      { x: 600, y: 50, line: 0 },
      { x: 800, y: 50, line: 0 },
    ])
  })

  it('no output box overlaps the inputs zone on any line, however many wrap', () => {
    // 3 two-wire inputs end at 50 + 3 * 150 + 2 * 100 = 700; 30 one-wire outputs wrap on a 10-module span
    const l = computeLayout(
      panel('top', 'top', {
        railWidthModules: 10,
        inputCables: inputs(3, 2),
        outputCables: outputs(30, 1),
      }),
    )
    const inputsEnd = Math.max(...l.inputBoxes.map((b) => b.x + b.w))
    expect(inputsEnd).toBe(700)
    expect(Math.max(...l.outputBoxes.map((b) => b.line))).toBeGreaterThan(1)
    for (const o of l.outputBoxes) expect(o.x).toBeGreaterThanOrEqual(inputsEnd + 200)
    // and none passes the rail end
    for (const o of l.outputBoxes) expect(o.x + o.w).toBeLessThanOrEqual(l.railsLeft + 10 * 175)
  })

  it('a bottom side behaves the same: zone after the inputs on every line, inputs wrapping at half width', () => {
    const l = computeLayout(
      panel('bottom', 'bottom', {
        railWidthModules: 10,
        inputCables: inputs(3, 2),
        outputCables: outputs(30, 1),
      }),
    )
    const inputsEnd = Math.max(...l.inputBoxes.map((b) => b.x + b.w))
    for (const o of l.outputBoxes) expect(o.x).toBeGreaterThanOrEqual(inputsEnd + 200)
    expect(l.cableBoxes.every((b) => b.side === 'bottom')).toBe(true)
  })

  it('top: a single over-long box sits alone on its line; the next box starts the next line', () => {
    // inputs on the left, so the top holds outputs only; span 175 < 250
    const l = computeLayout(
      panel('left', 'top', {
        railWidthModules: 1,
        inputCables: inputs(1, 2),
        outputCables: outputs(2, 4),
      }),
    )
    // railsLeft = 50 + 250 + 150 = 450
    expect(l.railsLeft).toBe(450)
    expect(l.outputBoxes.map(place)).toEqual([
      { x: 450, y: 200, line: 0 },
      { x: 450, y: 600, line: 1 },
    ])
    // the over-long box runs past the rail end (625) and the sheet includes it: 700 + MARGIN
    expect(l.width).toBe(700 + 200)
  })

  it('left: outputs wrap within the rails height; the band moves railsLeft inwards', () => {
    // no rails: area 900 high; railsTop 850 (inputs on top); span [850, 1750]; 250-long boxes
    const l = computeLayout(panel('top', 'left', { outputCables: outputs(3, 4) }))
    expect(l.railsTop).toBe(850)
    expect(l.outputBoxes.map(place)).toEqual([
      { x: 200, y: 850, line: 0 },
      { x: 200, y: 1200, line: 0 },
      { x: 600, y: 850, line: 1 }, // 1550 + 250 > 1750
    ])
    // two lines: depth 650, railsLeft = 200 + 650 + 150
    expect(l.railsLeft).toBe(1000)
    // wire points on the right edge of each box, 0 = top
    expect(l.cableWires.get(id(1000))?.pt).toEqual({ x: 450, y: 900 })
    expect(l.cableWires.get(id(1020))?.pt).toEqual({ x: 850, y: 900 })
  })

  it('left, shared with inputs: outputs start below the inputs; long inputs push them to line 1', () => {
    // inputs 2 wires (150) at y 50..200; the top is empty, so the span is [50, 1500]: outputs follow the
    // inputs at 200 + 100 = 300
    const a = computeLayout(
      panel('left', 'left', { inputCables: inputs(1, 2), outputCables: outputs(1, 1) }),
    )
    expect(a.railsTop).toBe(600)
    expect(box(a, id(100))).toMatchObject({ x: 50, y: 300, line: 0 })
    // six 2-wire inputs end at 1450 > 1500 - 100: the output wraps onto line 1 at the span start 50
    const b = computeLayout(
      panel('left', 'left', { inputCables: inputs(6, 2), outputCables: outputs(1, 1) }),
    )
    expect(box(b, id(100))).toMatchObject({ y: 50, line: 1, x: 50 + 250 + 150 })
  })

  it('left, shared: the output follows the last input while it still fits (inputsEnd + gap > span start)', () => {
    // two 4-wire inputs end at 650; outputs start at 750
    const l = computeLayout(
      panel('left', 'left', { inputCables: inputs(2, 4), outputCables: outputs(1, 1) }),
    )
    expect(box(l, id(100))).toMatchObject({ y: 750, line: 0 })
  })

  it('right: outputs wrap within the rails height; line 0 is the outermost (rightmost)', () => {
    // one rail, spacing 100 mm: area 1000 + 450 = 1450; railsTop 850; span [850, 2300]
    const l = computeLayout(
      panel('top', 'right', {
        railWidthModules: 10,
        outputCables: outputs(5, 4),
        rails: [rail(10, 10, 100)],
      }),
    )
    expect(l.outputBoxes.map(place)).toEqual([
      { x: 2500, y: 850, line: 0 },
      { x: 2500, y: 1200, line: 0 },
      { x: 2500, y: 1550, line: 0 },
      { x: 2500, y: 1900, line: 0 }, // ends at 2150
      { x: 2100, y: 850, line: 1 }, // 2250 + 250 > 2300
    ])
    // railsRight 1950; band starts 2100; depth 650: width = 1950 + 150 + 650 + 200
    expect(l.width).toBe(2950)
    // wire points on the left edge of each box
    expect(l.cableWires.get(id(1040))?.pt).toEqual({ x: 2100, y: 900 })
    // the rails stay on the left; sheet bottom: rails end at 2300 -> bottom row 2450
    expect(l.bottomRowY).toBe(2450)
  })

  it('right, shared with inputs: inputs end past the span, outputs start on line 1', () => {
    // six 2-wire inputs end at 1450; span [50, 1500]: 1550 + 100 > 1500
    const l = computeLayout(
      panel('right', 'right', { inputCables: inputs(6, 2), outputCables: outputs(1, 1) }),
    )
    expect(l.railsTop).toBe(600)
    expect(box(l, id(100))).toMatchObject({ y: 50, line: 1 })
    // line 1 is the inner one: x = railsRight + 150 + 650 - 250 - 400
    expect(box(l, id(100)).x).toBe(4400 + 150)
    expect(box(l, id(200)).x).toBe(4400 + 150 + 400)
  })

  it('a wrapped output band adds the lines to the width only on the right side', () => {
    const l = computeLayout(
      panel('top', 'right', { railWidthModules: 10, outputCables: outputs(3, 4) }),
    )
    // no rails: area 900, span [850, 1750]: two per line (1550 + 250 > 1750 wraps)
    expect(new Set(l.outputBoxes.map((b) => b.line))).toEqual(new Set([0, 1]))
    expect(l.width).toBe(200 + 1750 + 150 + bandDepth(2) + 200)
  })

  it('three lines: band depth 1050 moves topRowY and railsTop', () => {
    // 11 four-wire outputs on a 1750 span: 5 + 5 + 1; inputs on the bottom
    const l = computeLayout(
      panel('bottom', 'top', {
        railWidthModules: 10,
        outputCables: outputs(11, 4),
        inputCables: inputs(1, 2),
      }),
    )
    expect(l.outputBoxes.map((b) => b.line)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2])
    expect(l.outputBoxes.map((b) => b.y)).toEqual([
      200, 200, 200, 200, 200, 600, 600, 600, 600, 600, 1000,
    ])
    expect(l.topRowY).toBe(200 + 3 * CABLE_BOX_H + 2 * CABLE_LINE_GAP + 150)
    expect(l.railsTop).toBe(1400 + 250 + 150)
  })
})

describe('output span start on a left/right side', () => {
  it.each<[CableSide, CableSide]>([
    ['left', 'right'],
    ['right', 'left'],
  ])('inputs %s, outputs %s: the outputs start level with the inputs, at SHEET_INSET', (i, o) => {
    const l = computeLayout(panel(i, o, { railWidthModules: 10, outputCables: outputs(3, 4) }))
    // the top is empty: railsTop 600, no rails -> span [50, 600 + 900 = 1500]; 250-long boxes, pitch 350
    expect(l.railsTop).toBe(600)
    expect(l.outputBoxes.map((b) => b.y)).toEqual([50, 400, 750])
    expect(new Set(l.outputBoxes.map((b) => b.line))).toEqual(new Set([0]))
    // the input column starts there too
    expect(l.inputBoxes[0]!.y).toBe(50)
    expect(l.cableWires.get(id(1000))?.pt.y).toBe(100)
  })

  it('a top side holding cables keeps the span start at railsTop', () => {
    // inputs on top, outputs right: topRowY 450, railsTop 850
    const l = computeLayout(
      panel('top', 'right', { railWidthModules: 10, outputCables: outputs(2, 4) }),
    )
    expect(l.railsTop).toBe(850)
    expect(l.outputBoxes.map((b) => b.y)).toEqual([850, 1200])
    // outputs on top with the inputs on the left: also railsTop
    const o = computeLayout(
      panel('left', 'top', { railWidthModules: 10, outputCables: outputs(1, 1) }),
    )
    expect(o.outputBoxes[0]).toMatchObject({ side: 'top' })
    const both = computeLayout(
      panel('left', 'right', {
        railWidthModules: 10,
        outputCables: outputs(1, 1),
        inputCables: inputs(1, 1),
      }),
    )
    expect(both.outputBoxes[0]!.y).toBe(50)
  })

  it('the outputs never extend below railsBottom, wrapping onto a new line instead', () => {
    // one rail, spacing 100 mm: railsTop 600, cy 1600, railsBottom 1600 + 450 = 2050
    const l = computeLayout(
      panel('left', 'right', {
        railWidthModules: 10,
        outputCables: outputs(12, 4),
        rails: [rail(10, 10, 100)],
      }),
    )
    const railsBottom = l.rails[0]!.cy + 450
    expect(railsBottom).toBe(2050)
    expect(Math.max(...l.outputBoxes.map((b) => b.y + b.h))).toBeLessThanOrEqual(railsBottom)
    // span [50, 2050] holds 6 boxes of 250 (the sixth ends exactly at 50 + 6 * 250 + 5 * 100 = 2050)
    expect(l.outputBoxes.filter((b) => b.line === 0)).toHaveLength(6)
    expect(Math.max(...l.outputBoxes.map((b) => b.line))).toBe(1)
  })

  it('with the span start at SHEET_INSET the line count still ignores the top band (no cycle)', () => {
    const l = computeLayout(
      panel('left', 'right', { railWidthModules: 10, outputCables: outputs(5, 4) }),
    )
    // span [50, 1500]: 4 boxes fit (the fourth ends at 1350, a fifth would end at 1800)
    expect(l.outputBoxes.filter((b) => b.line === 0)).toHaveLength(4)
    expect(l.width).toBe(l.railsLeft + 10 * 175 + 150 + bandDepth(2) + 200)
  })
})

describe('sheet size', () => {
  it('right-side inputs: width = railsRight + 150 + depth + 50', () => {
    const l = computeLayout(panel('right', 'bottom', { inputCables: inputs(2, 1) }))
    // 2 boxes of 1 wire: 50..150 and 250..350 on a single column (line 0)
    expect(l.width).toBe(200 + 4200 + 150 + 250 + 50)
    for (const b of l.inputBoxes) expect(l.width - (b.x + b.w)).toBe(50)
  })

  it('a top band of outputs stays within the rails: the width is the rails plus the margins', () => {
    const l = computeLayout(
      panel('top', 'bottom', { railWidthModules: 4, outputCables: outputs(1, 1) }),
    )
    expect(l.width).toBe(200 + 700 + 200)
  })

  it('many inputs wrap at half the sheet instead of extending it', () => {
    const wide = computeLayout(
      panel('top', 'bottom', { railWidthModules: 4, inputCables: inputs(5, 4) }),
    )
    expect(wide.width).toBe(200 + 700 + 200)
    expect(new Set(wide.inputBoxes.map((b) => b.line)).size).toBe(5)
  })
})

describe('no rails', () => {
  it('uses railsTop as the rails bottom and a 900 tall rails area for the side columns', () => {
    const l = computeLayout(panel('top', 'bottom', { outputCables: outputs(1, 1) }))
    expect(l.rails).toEqual([])
    expect(l.railsTop).toBe(850)
    // sideBottom = railsTop, bottomRowY = 850 + 150, band below the row
    expect(l.bottomRowY).toBe(1000)
    expect(l.bandTop).toBe(1400)
    expect(box(l, id(100)).y).toBe(1400)
    expect(l.height).toBe(1400 + 250 + 200)
  })

  it('no output and no rails: the bottom row follows railsTop directly', () => {
    const l = computeLayout(panel('top', 'bottom'))
    expect([l.bottomRowY, l.height]).toEqual([1000, 1450])
  })
})
