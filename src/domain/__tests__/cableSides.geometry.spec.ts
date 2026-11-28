/** Drawing geometry by cable side (panel-domain "Drawing geometry"): hand-computed tables in tenths of mm. */
import { describe, expect, it } from 'vitest'
import {
  CABLE_WIRE_DIRECTION,
  computeLayout,
  endpointDirection,
  endpointPoint,
  type Direction,
} from '../geometry'
import { CABLE_SIDES, type CableSide, type PanelContent } from '../panelContent'
import {
  busbar,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  pole,
  rail,
  rowBlock,
  term,
} from './helpers'

const sideContent = (input: CableSide, output: CableSide, over: Partial<PanelContent> = {}) =>
  content({
    inputCableSide: input,
    outputCableSide: output,
    inputCables: [inputCable(1, [2, 3])], // 150 u long
    outputCables: [outputCable(4, [5])], // 100 u long
    railWidthModules: 24,
    ...over,
  })

describe('default sides (inputs top, outputs bottom)', () => {
  const layout = computeLayout(
    content({
      railWidthModules: 24,
      rails: [rail(10, 24, 150, [element(20, 2, 2, 2)])],
      outputCables: [outputCable(4, [5])],
    }),
  )

  it.each([
    ['railsLeft', layout.railsLeft, 200],
    ['topRowY', layout.topRowY, 450],
    ['railsTop', layout.railsTop, 850],
    ['rail cy', layout.rails[0]?.cy, 2350],
    ['bottomRowY', layout.bottomRowY, 2350 + 450 + 150],
    ['bandTop', layout.bandTop, 2950 + 250 + 150],
    ['height', layout.height, 3350 + 250 + 200],
    ['width', layout.width, 200 + 200 + 24 * 175],
  ])('%s = %i', (_n, actual, expected) => expect(actual).toBe(expected))

  it('the input box is on top, the output box at the bottom, each with its side', () => {
    expect(layout.inputBoxes[0]).toMatchObject({ side: 'top', x: 50, y: 50, w: 100, h: 250 })
    expect(layout.outputBoxes[0]).toMatchObject({ side: 'bottom', x: 200, y: 3350, w: 100, h: 250 })
  })

  it('wire points: input on the bottom edge of its box, output on the top edge of its box', () => {
    expect(endpointPoint(layout, cw(id(2)))).toEqual({ x: 100, y: 300 })
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 250, y: 3350 })
    expect(endpointDirection(layout, cw(id(2)))).toBe('down')
    expect(endpointDirection(layout, cw(id(5)))).toBe('up')
  })

  it('the cable spots carry kind and side', () => {
    expect(layout.cableWires.get(id(2))).toMatchObject({
      kind: 'input',
      side: 'top',
      cableId: id(1),
    })
    expect(layout.cableWires.get(id(5))).toMatchObject({
      kind: 'output',
      side: 'bottom',
      cableId: id(4),
    })
  })
})

describe('CABLE_WIRE_DIRECTION', () => {
  it.each([
    ['top', 'down'],
    ['bottom', 'up'],
    ['left', 'right'],
    ['right', 'left'],
  ] as [CableSide, Direction][])('side %s leaves %s', (side, dir) => {
    expect(CABLE_WIRE_DIRECTION[side]).toBe(dir)
  })

  it.each(CABLE_SIDES)('endpointDirection of an input cable on %s follows the table', (side) => {
    const layout = computeLayout(sideContent(side, 'bottom', { outputCables: [] }))
    expect(endpointDirection(layout, cw(id(2)))).toBe(CABLE_WIRE_DIRECTION[side])
  })

  it.each(CABLE_SIDES)('endpointDirection of an output cable on %s follows the table', (side) => {
    const layout = computeLayout(sideContent('top', side))
    expect(endpointDirection(layout, cw(id(5)))).toBe(CABLE_WIRE_DIRECTION[side])
  })
})

describe('input cables on the left', () => {
  // no top cables: topRowY 200, railsTop 600; railsLeft = SHEET_INSET 50 + 250 + 150
  const c = sideContent('left', 'bottom', {
    outputCables: [],
    rails: [rail(10, 24, 150, [element(20, 2, 2, 2)], [], [busbar(60, 'L', id(20), 1)])],
  })
  const layout = computeLayout(c)

  it('railsLeft moves right by the column and the top band moves up to the margin', () => {
    expect(layout.railsLeft).toBe(450)
    expect(layout.topRowY).toBe(200)
    expect(layout.railsTop).toBe(600)
  })

  it('the column box is CABLE_BOX_H wide and as tall as its wires need, from SHEET_INSET', () => {
    expect(layout.inputBoxes[0]).toMatchObject({ side: 'left', x: 50, y: 50, w: 250, h: 150 })
  })

  it('wire points sit on the right edge, pitch 50, direction right', () => {
    expect(endpointPoint(layout, cw(id(2)))).toEqual({ x: 300, y: 100 })
    expect(endpointPoint(layout, cw(id(3)))).toEqual({ x: 300, y: 150 })
    expect(endpointDirection(layout, cw(id(2)))).toBe('right')
  })

  it('rails, elements and busbars start at railsLeft', () => {
    expect(layout.rails[0]).toMatchObject({ x: 450, w: 24 * 175 })
    expect(layout.elements.get(id(20))).toMatchObject({ x: 450 + 2 * 175, y: 2100 - 450 })
    expect(layout.busbars.get(id(60))).toMatchObject({ x: 450 + 2 * 175, w: 2 * 175 })
    expect(endpointPoint(layout, pole(id(20), 0, 'input'))).toEqual({ x: 800 + 88, y: 1650 })
  })

  it('both terminal rows start at railsLeft', () => {
    const rows = computeLayout(
      content({
        inputCableSide: 'left',
        terminalRow: [rowBlock(40, 3, 2)],
        bottomTerminalRow: [rowBlock(41, 1, 2)],
      }),
    )
    expect(rows.blocks.get(id(40))).toMatchObject({ x: 450 + 3 * 175, y: rows.topRowY, row: 'top' })
    expect(rows.blocks.get(id(41))).toMatchObject({
      x: 450 + 175,
      y: rows.bottomRowY,
      row: 'bottom',
    })
  })

  it('the drawing is as wide as railsLeft + rails and as high as the column when it is taller', () => {
    expect(layout.width).toBe(200 + 450 + 24 * 175)
    // column bottom 50 + 150 = 200 < rail bottom 2550: the rails decide
    expect(layout.bottomRowY).toBe(2550 + 150)
    expect(layout.height).toBe(2700 + 250 + 200)
  })
})

describe('output cables on the right', () => {
  const layout = computeLayout(sideContent('top', 'right'))

  it('the column stands right of the rails, a gap away, from railsTop', () => {
    expect(layout.outputBoxes[0]).toMatchObject({
      side: 'right',
      x: 200 + 24 * 175 + 150,
      y: 850,
      w: 250,
      h: 100,
    })
  })

  it('wire points sit on the left edge, direction left', () => {
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 4550, y: 900 })
    expect(endpointDirection(layout, cw(id(5)))).toBe('left')
  })

  it('the drawing width includes the column and the right margin', () => {
    expect(layout.width).toBe(200 + 4550 + 250)
    expect(layout.railsLeft).toBe(200)
  })

  it('no bottom cables: the bottom band follows the column, which is taller than the empty rails area', () => {
    // no rails: sideBottom = max(railsTop 850, colBottom 850 + 100) = 950
    expect(layout.bottomRowY).toBe(1100)
    expect(layout.height).toBe(1100 + 250 + 200)
  })
})

describe('both kinds on the same side (inputs first, then outputs)', () => {
  it('top: one row, input then output, separated by CABLE_GAP; captions keep their own numbers', () => {
    const layout = computeLayout(sideContent('top', 'top'))
    expect(layout.inputBoxes[0]).toMatchObject({ x: 50, y: 50, w: 150, index: 0, side: 'top' })
    // the output zone starts IO_GAP (20 mm) after the inputs (400), but a shared side right-aligns the
    // line to the rail end: railsRight = 200 + 24 * 175 = 4400, a 100 u box starts at 4300
    expect(layout.outputBoxes[0]).toMatchObject({ x: 4300, y: 50, w: 100, index: 0, side: 'top' })
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 4350, y: 300 })
    expect(layout.height).toBe(layout.bottomRowY + 250 + 200) // nothing at the bottom
    expect(layout.width).toBe(200 + 200 + 24 * 175)
  })

  it('bottom: the mirror of the top - rails, bottom terminal row, then one cable band at the edge', () => {
    const layout = computeLayout(sideContent('bottom', 'bottom'))
    expect(layout.topRowY).toBe(200) // nothing on top
    expect(layout.bottomRowY).toBe(750) // railsTop 600 (no rails) + CABLE_ROW_GAP
    expect(layout.bandTop).toBe(750 + 250 + 150)
    // inputs and outputs share line 0; the output zone starts IO_GAP after the inputs
    expect(layout.inputBoxes[0]).toMatchObject({
      x: 50,
      y: layout.bandTop,
      side: 'bottom',
      line: 0,
    })
    expect(layout.outputBoxes[0]).toMatchObject({
      x: 4300, // right-aligned to the rail end 4400
      y: layout.bandTop,
      side: 'bottom',
      line: 0,
    })
    expect(layout.height).toBe(layout.bandTop + 250 + 50) // m_bottom = SHEET_INSET (input side)
  })

  it('left: one column, input then output, stacked with CABLE_GAP', () => {
    const layout = computeLayout(sideContent('left', 'left'))
    expect(layout.inputBoxes[0]).toMatchObject({ x: 50, y: 50, w: 250, h: 150 })
    // the top side is empty: the output span starts at SHEET_INSET (50), so the outputs follow the inputs
    // (they end at 200): 200 + CABLE_GAP = 300
    expect(layout.outputBoxes[0]).toMatchObject({ x: 50, y: 300, w: 250, h: 100 })
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 300, y: 350 })
    expect(layout.railsLeft).toBe(450)
  })

  it('right: one column right of the rails, input then output', () => {
    const layout = computeLayout(sideContent('right', 'right'))
    const x = 200 + 24 * 175 + 150
    expect(layout.inputBoxes[0]).toMatchObject({ x, y: 50, h: 150 })
    expect(layout.outputBoxes[0]).toMatchObject({ x, y: 300, h: 100 })
  })

  it('swapped (inputs bottom, outputs top) is valid', () => {
    const layout = computeLayout(sideContent('bottom', 'top'))
    expect(layout.outputBoxes[0]).toMatchObject({ side: 'top', y: 200 })
    expect(layout.inputBoxes[0]).toMatchObject({ side: 'bottom', y: layout.bandTop })
    expect(endpointDirection(layout, cw(id(2)))).toBe('up')
    expect(endpointDirection(layout, cw(id(5)))).toBe('down')
  })

  it('an empty list keeps the order within its kind (several cables per kind)', () => {
    const c = sideContent('top', 'top', {
      inputCables: [inputCable(1, [2]), inputCable(6, [7])],
      outputCables: [outputCable(4, [5]), outputCable(8, [9])],
    })
    const layout = computeLayout(c)
    const row = [...layout.inputBoxes, ...layout.outputBoxes].sort((a, b) => a.x - b.x)
    expect(row.map((b) => [b.kind, b.index])).toEqual([
      ['input', 0],
      ['input', 1],
      ['output', 0],
      ['output', 1],
    ])
  })
})

describe('a side column taller than the rails pushes the bottom bands down', () => {
  const tall = (over: Partial<PanelContent> = {}) =>
    content({
      inputCableSide: 'left',
      railWidthModules: 24,
      // 10 four-wire cables: 10 * 250 + 9 * 100 = 3400 u, from SHEET_INSET
      inputCables: Array.from({ length: 10 }, (_, i) =>
        inputCable(100 + i, [200 + 4 * i, 201 + 4 * i, 202 + 4 * i, 203 + 4 * i]),
      ),
      rails: [rail(10, 24, 150)],
      ...over,
    })

  it('sideBottom = railsTop + column length; the bottom row follows', () => {
    const layout = computeLayout(tall())
    expect(layout.railsTop).toBe(600)
    expect(layout.bottomRowY).toBe(50 + 3400 + 150)
    expect(layout.height).toBe(3600 + 250 + 200)
  })

  it('the bottom terminal row goes under the column and the cable band under the row', () => {
    const layout = computeLayout(tall({ outputCables: [outputCable(4, [5])] }))
    expect(layout.outputBoxes[0]).toMatchObject({ side: 'bottom', y: 3600 + 250 + 150 })
    expect(layout.bandTop).toBe(3600 + 250 + 150)
  })

  it('a right column of inputs (never wrapped) decides too, when it is the tallest', () => {
    const layout = computeLayout(
      tall({
        inputCableSide: 'right',
        inputCables: Array.from({ length: 20 }, (_, i) => inputCable(100 + i, [200 + i, 300 + i])),
      }),
    )
    // 20 * 150 + 19 * 100 = 4900 u from SHEET_INSET, longer than the single rail reaches (railsTop + 1950)
    expect(layout.bottomRowY).toBe(50 + 4900 + 150)
  })

  it('output cables wrap within the rail span, so their column never pushes the bottom down', () => {
    const layout = computeLayout(
      tall({
        inputCableSide: 'top',
        outputCableSide: 'right',
        inputCables: [inputCable(1, [2])],
        // 8 two-wire boxes fit one 1950-long line (8 * 150 + 7 * 100 = 1900): 20 boxes make 3 lines
        outputCables: Array.from({ length: 20 }, (_, i) =>
          outputCable(100 + i, [200 + i, 300 + i]),
        ),
      }),
    )
    expect(Math.max(...layout.outputBoxes.map((b) => b.line))).toBe(2)
    expect(layout.bottomRowY).toBe(layout.railsTop + 1500 + 450 + 150)
  })

  it('when the rails are lower than the column the rails decide', () => {
    const layout = computeLayout(
      tall({
        inputCables: [inputCable(1, [2])],
        rails: [rail(10, 24, 150), rail(11, 24, 150), rail(12, 24, 150)],
      }),
    )
    expect(layout.bottomRowY).toBe(600 + 1500 * 3 + 450 + 150)
  })
})

describe('no output cables and no rails', () => {
  it('an absent kind takes no space: the layout is the same with or without it on a side', () => {
    const without = computeLayout(
      content({ outputCables: [], outputCableSide: 'right', railWidthModules: 24 }),
    )
    const top = computeLayout(content({ outputCables: [], railWidthModules: 24 }))
    expect(without.width).toBe(top.width)
    expect(without.height).toBe(top.height)
    expect(without.railsLeft).toBe(200)
  })

  it('no output cables: the bottom row is one gap under the rails', () => {
    const layout = computeLayout(content({ rails: [rail(10, 24, 150)], outputCables: [] }))
    expect(layout.bottomRowY).toBe(2800 + 150)
    expect(layout.height).toBe(layout.bottomRowY + 250 + 200)
  })

  it('no rails and no cables on the left: sideBottom is railsTop', () => {
    const layout = computeLayout(content({ outputCables: [] }))
    expect(layout.bottomRowY).toBe(layout.railsTop + 150)
    expect(layout.bottomRowY).toBe(1000)
  })

  it('no rails, an output cable at the bottom: the cable band is under the bottom row', () => {
    const layout = computeLayout(content({ outputCables: [outputCable(4, [5])] }))
    expect(layout.bottomRowY).toBe(1000)
    expect(layout.outputBoxes[0]?.y).toBe(1000 + 250 + 150)
  })

  it('a bottom-row block sits on the bottom band; its contacts leave up and down', () => {
    const layout = computeLayout(
      content({
        outputCables: [outputCable(4, [5])],
        bottomTerminalRow: [rowBlock(40, 0, 2)],
      }),
    )
    expect(layout.blocks.get(id(40))).toMatchObject({ y: 1000, h: 250, row: 'bottom' })
    expect(endpointPoint(layout, term(id(40), 0, 'top'))?.y).toBe(1000)
    expect(endpointPoint(layout, term(id(40), 0, 'bottom'))?.y).toBe(1250)
    expect(layout.height).toBe(1400 + 250 + 200)
  })
})

describe('drawing size with wide cable rows', () => {
  const wide = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      inputCable(100 + i, [200 + 4 * i, 201 + 4 * i, 202 + 4 * i, 203 + 4 * i]),
    )

  it('a top row wider than half the sheet wraps instead of widening the drawing', () => {
    const layout = computeLayout(content({ inputCables: wide(20), railWidthModules: 24 }))
    expect(layout.width).toBe(200 + 24 * 175 + 200)
    expect(Math.max(...layout.inputBoxes.map((b) => b.line))).toBe(3)
  })

  it('the same cables on the left narrow it to the rails plus the column', () => {
    const layout = computeLayout(
      content({ inputCables: wide(20), inputCableSide: 'left', railWidthModules: 60 }),
    )
    expect(layout.width).toBe(200 + 450 + 60 * 175)
  })

  it('a bottom row wraps at half the sheet as well', () => {
    const layout = computeLayout(
      content({ inputCables: wide(20), inputCableSide: 'bottom', railWidthModules: 24 }),
    )
    expect(layout.width).toBe(200 + 24 * 175 + 200)
    expect(layout.height).toBe(layout.bandTop + (4 * 250 + 3 * 150) + 50)
  })

  it('a right column adds a gap and a box width', () => {
    const layout = computeLayout(content({ inputCableSide: 'right', railWidthModules: 24 }))
    expect(layout.width).toBe(200 + 24 * 175 + 150 + 250 + 50) // the input side keeps only SHEET_INSET
  })
})

describe('every derived coordinate is an integer for every side combination', () => {
  const pairs = CABLE_SIDES.flatMap((i) => CABLE_SIDES.map((o) => [i, o] as const))
  it.each(pairs)('inputs %s, outputs %s', (input, output) => {
    const layout = computeLayout(
      sideContent(input, output, {
        rails: [rail(10, 24, 150.3, [element(20, 1, 3, 3)])],
        terminalRow: [rowBlock(40, 0, 3)],
        bottomTerminalRow: [rowBlock(41, 2, 5)],
      }),
    )
    const numbers: number[] = [
      layout.railsLeft,
      layout.topRowY,
      layout.railsTop,
      layout.bandTop,
      layout.bottomRowY,
      layout.width,
      layout.height,
    ]
    for (const b of [...layout.inputBoxes, ...layout.outputBoxes]) {
      numbers.push(b.x, b.y, b.w, b.h)
      for (const w of b.wires) numbers.push(w.pt.x, w.pt.y)
    }
    for (const b of layout.blocks.values()) numbers.push(b.x, b.y, b.w, b.h)
    expect(numbers.every(Number.isInteger)).toBe(true)
    expect(layout.inputBoxes.every((b) => b.side === input)).toBe(true)
    expect(layout.outputBoxes.every((b) => b.side === output)).toBe(true)
  })
})

describe('layout cache across a side change', () => {
  it('rail, element and block boxes follow railsLeft when the side changes (same item objects)', () => {
    const e = element(20, 2, 2, 2)
    const railItem = rail(10, 24, 150, [e], [])
    const topC = content({ rails: [railItem], terminalRow: [rowBlock(40, 1, 2)] })
    const a = computeLayout(topC)
    const b = computeLayout({ ...topC, inputCableSide: 'left' })
    const back = computeLayout(topC)
    expect(a.elements.get(id(20))?.x).toBe(200 + 2 * 175)
    expect(b.elements.get(id(20))?.x).toBe(450 + 2 * 175)
    expect(back.elements.get(id(20))?.x).toBe(200 + 2 * 175)
    expect(a.rails[0]?.x).toBe(200)
    expect(b.rails[0]?.x).toBe(450)
    expect(b.blocks.get(id(40))?.x).toBe(450 + 175)
  })

  it('a cable box follows its side (same cable object)', () => {
    const cable = inputCable(1, [2, 3])
    const base = content({ inputCables: [cable] })
    expect(computeLayout(base).inputBoxes[0]).toMatchObject({ side: 'top', w: 150, h: 250 })
    const left = computeLayout({ ...base, inputCableSide: 'left' })
    expect(left.inputBoxes[0]).toMatchObject({ side: 'left', w: 250, h: 150, x: 50, y: 50 })
    expect(computeLayout(base).inputBoxes[0]).toMatchObject({ side: 'top', w: 150, h: 250 })
  })

  it('a layout of a content with a side change equals a fresh layout of an unshared copy', () => {
    const c = sideContent('right', 'left', { rails: [rail(10, 24, 150, [element(20, 0, 2, 2)])] })
    computeLayout(sideContent('top', 'bottom', { rails: c.rails, inputCables: c.inputCables }))
    expect(computeLayout(c)).toEqual(computeLayout(structuredClone(c)))
  })
})
