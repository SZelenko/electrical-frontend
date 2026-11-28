/** Drawing geometry by cable side (panel-domain "Drawing geometry"): hand-computed tables in tenths of mm. */
import { describe, expect, it } from 'vitest'
import {
  CABLE_WIRE_DIRECTION,
  cableTextOffsets,
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
    inputCables: [inputCable(1, [2, 3])], // 300 u long
    outputCables: [outputCable(4, [5])], // 200 u long
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
    ['topRowY', layout.topRowY, 600],
    ['railsTop', layout.railsTop, 1000],
    ['rail cy', layout.rails[0]?.cy, 2500],
    ['outTop', layout.outTop, 2500 + 450 + 150],
    ['bottomRowY', layout.bottomRowY, 3100 + 250 + 150],
    ['height', layout.height, 3500 + 250 + 200],
    ['width', layout.width, 200 + 200 + 24 * 175],
  ])('%s = %i', (_n, actual, expected) => expect(actual).toBe(expected))

  it('the input box is on top, the output box at the bottom, each with its side', () => {
    expect(layout.inputBoxes[0]).toMatchObject({ side: 'top', x: 200, y: 200, w: 200, h: 250 })
    expect(layout.outputBoxes[0]).toMatchObject({ side: 'bottom', x: 200, y: 3100, w: 200, h: 250 })
  })

  it('wire points: input on the bottom edge of its box, output on the top edge of its box', () => {
    expect(endpointPoint(layout, cw(id(2)))).toEqual({ x: 300, y: 450 })
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 300, y: 3100 })
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

describe('cableTextOffsets (caption and label baselines by side)', () => {
  it.each([
    ['top', { caption: 80, label: 130 }],
    ['bottom', { caption: 190, label: 140 }],
    ['left', { caption: 80, label: 130 }],
    ['right', { caption: 190, label: 140 }],
  ] as const)('%s', (side, expected) => expect(cableTextOffsets(side)).toEqual(expected))
})

describe('input cables on the left', () => {
  // no top cables: topRowY 200, railsTop 600; railsLeft = 200 + 250 + 150
  const c = sideContent('left', 'bottom', {
    outputCables: [],
    rails: [rail(10, 24, 150, [element(20, 2, 2, 2)], [], [busbar(60, 'L', id(20), 1)])],
  })
  const layout = computeLayout(c)

  it('railsLeft moves right by the column and the top band moves up to the margin', () => {
    expect(layout.railsLeft).toBe(600)
    expect(layout.topRowY).toBe(200)
    expect(layout.railsTop).toBe(600)
  })

  it('the column box is CABLE_BOX_H wide and as tall as its wires need, from railsTop', () => {
    expect(layout.inputBoxes[0]).toMatchObject({ side: 'left', x: 200, y: 600, w: 250, h: 300 })
  })

  it('wire points sit on the right edge, pitch 100, direction right', () => {
    expect(endpointPoint(layout, cw(id(2)))).toEqual({ x: 450, y: 700 })
    expect(endpointPoint(layout, cw(id(3)))).toEqual({ x: 450, y: 800 })
    expect(endpointDirection(layout, cw(id(2)))).toBe('right')
  })

  it('rails, elements and busbars start at railsLeft', () => {
    expect(layout.rails[0]).toMatchObject({ x: 600, w: 24 * 175 })
    expect(layout.elements.get(id(20))).toMatchObject({ x: 600 + 2 * 175, y: 2100 - 450 })
    expect(layout.busbars.get(id(60))).toMatchObject({ x: 600 + 2 * 175, w: 2 * 175 })
    expect(endpointPoint(layout, pole(id(20), 0, 'input'))).toEqual({ x: 950 + 88, y: 1650 })
  })

  it('both terminal rows start at railsLeft', () => {
    const rows = computeLayout(
      content({
        inputCableSide: 'left',
        terminalRow: [rowBlock(40, 3, 2)],
        bottomTerminalRow: [rowBlock(41, 1, 2)],
      }),
    )
    expect(rows.blocks.get(id(40))).toMatchObject({ x: 600 + 3 * 175, y: rows.topRowY, row: 'top' })
    expect(rows.blocks.get(id(41))).toMatchObject({
      x: 600 + 175,
      y: rows.bottomRowY,
      row: 'bottom',
    })
  })

  it('the drawing is as wide as railsLeft + rails and as high as the column when it is taller', () => {
    expect(layout.width).toBe(200 + 600 + 24 * 175)
    // column bottom 600 + 300 = 900 < rail bottom 2550: the rails decide
    expect(layout.outTop).toBe(2550 + 150)
    expect(layout.bottomRowY).toBe(2700)
    expect(layout.height).toBe(2700 + 250 + 200)
  })
})

describe('output cables on the right', () => {
  const layout = computeLayout(sideContent('top', 'right'))

  it('the column stands right of the rails, a gap away, from railsTop', () => {
    expect(layout.outputBoxes[0]).toMatchObject({
      side: 'right',
      x: 200 + 24 * 175 + 150,
      y: 1000,
      w: 250,
      h: 200,
    })
  })

  it('wire points sit on the left edge, direction left', () => {
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 4550, y: 1100 })
    expect(endpointDirection(layout, cw(id(5)))).toBe('left')
  })

  it('the drawing width includes the column and the right margin', () => {
    expect(layout.width).toBe(200 + 4550 + 250)
    expect(layout.railsLeft).toBe(200)
  })

  it('no bottom cables: the bottom band follows the column, which is taller than the empty rails area', () => {
    // no rails: sideBottom = max(railsTop 1000, colBottom 1000 + 200) = 1200
    expect(layout.outTop).toBe(1350)
    expect(layout.bottomRowY).toBe(1350)
    expect(layout.height).toBe(1350 + 250 + 200)
  })
})

describe('both kinds on the same side (inputs first, then outputs)', () => {
  it('top: one row, input then output, separated by CABLE_GAP; captions keep their own numbers', () => {
    const layout = computeLayout(sideContent('top', 'top'))
    expect(layout.inputBoxes[0]).toMatchObject({ x: 200, y: 200, w: 300, index: 0, side: 'top' })
    expect(layout.outputBoxes[0]).toMatchObject({ x: 600, y: 200, w: 200, index: 0, side: 'top' })
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 700, y: 450 })
    expect(layout.bottomRowY).toBe(layout.outTop) // nothing at the bottom
    expect(layout.width).toBe(200 + 200 + 24 * 175)
  })

  it('bottom: the same order on the bottom row', () => {
    const layout = computeLayout(sideContent('bottom', 'bottom'))
    expect(layout.inputBoxes[0]).toMatchObject({ x: 200, y: layout.outTop, side: 'bottom' })
    expect(layout.outputBoxes[0]).toMatchObject({ x: 600, y: layout.outTop, side: 'bottom' })
    expect(layout.topRowY).toBe(200) // nothing on top
    expect(layout.bottomRowY).toBe(layout.outTop + 250 + 150)
  })

  it('left: one column, input then output, stacked with CABLE_GAP', () => {
    const layout = computeLayout(sideContent('left', 'left'))
    expect(layout.inputBoxes[0]).toMatchObject({ x: 200, y: 600, w: 250, h: 300 })
    expect(layout.outputBoxes[0]).toMatchObject({ x: 200, y: 1000, w: 250, h: 200 })
    expect(endpointPoint(layout, cw(id(5)))).toEqual({ x: 450, y: 1100 })
    expect(layout.railsLeft).toBe(600)
  })

  it('right: one column right of the rails, input then output', () => {
    const layout = computeLayout(sideContent('right', 'right'))
    const x = 200 + 24 * 175 + 150
    expect(layout.inputBoxes[0]).toMatchObject({ x, y: 600, h: 300 })
    expect(layout.outputBoxes[0]).toMatchObject({ x, y: 1000, h: 200 })
  })

  it('swapped (inputs bottom, outputs top) is valid', () => {
    const layout = computeLayout(sideContent('bottom', 'top'))
    expect(layout.outputBoxes[0]).toMatchObject({ side: 'top', y: 200 })
    expect(layout.inputBoxes[0]).toMatchObject({ side: 'bottom', y: layout.outTop })
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
      // 10 four-wire cables: 10 * 500 + 9 * 100 = 5900 u
      inputCables: Array.from({ length: 10 }, (_, i) =>
        inputCable(100 + i, [200 + 4 * i, 201 + 4 * i, 202 + 4 * i, 203 + 4 * i]),
      ),
      rails: [rail(10, 24, 150)],
      ...over,
    })

  it('sideBottom = railsTop + column length; the bottom row follows', () => {
    const layout = computeLayout(tall())
    expect(layout.railsTop).toBe(600)
    expect(layout.outTop).toBe(600 + 5900 + 150)
    expect(layout.bottomRowY).toBe(6650)
    expect(layout.height).toBe(6650 + 250 + 200)
  })

  it('the bottom cable row goes under the column and the bottom terminal row under it', () => {
    const layout = computeLayout(tall({ outputCables: [outputCable(4, [5])] }))
    expect(layout.outputBoxes[0]).toMatchObject({ side: 'bottom', y: 6650 })
    expect(layout.bottomRowY).toBe(6650 + 250 + 150)
  })

  it('a right column decides too, when it is the tallest', () => {
    const layout = computeLayout(
      tall({
        inputCableSide: 'top',
        outputCableSide: 'right',
        inputCables: [inputCable(1, [2])],
        outputCables: Array.from({ length: 8 }, (_, i) => outputCable(100 + i, [200 + i, 300 + i])),
      }),
    )
    // 8 * 300 + 7 * 100 = 3100 u, longer than the single rail reaches (rail bottom = railsTop + 1950)
    expect(layout.outTop).toBe(layout.railsTop + 3100 + 150)
  })

  it('when the rails are lower than the column the rails decide', () => {
    const layout = computeLayout(
      tall({
        inputCables: [inputCable(1, [2])],
        rails: [rail(10, 24, 150), rail(11, 24, 150), rail(12, 24, 150)],
      }),
    )
    expect(layout.outTop).toBe(600 + 1500 * 3 + 450 + 150)
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
    expect(layout.outTop).toBe(2950 + 150)
    expect(layout.bottomRowY).toBe(layout.outTop)
  })

  it('no rails and no cables on the left: sideBottom is railsTop', () => {
    const layout = computeLayout(content({ outputCables: [] }))
    expect(layout.outTop).toBe(layout.railsTop + 150)
    expect(layout.bottomRowY).toBe(1150)
  })

  it('no rails, an output cable at the bottom: the bottom row is under the cable box', () => {
    const layout = computeLayout(content({ outputCables: [outputCable(4, [5])] }))
    expect(layout.outputBoxes[0]?.y).toBe(1150)
    expect(layout.bottomRowY).toBe(1150 + 250 + 150)
  })

  it('a bottom-row block sits on the bottom band; its contacts leave up and down', () => {
    const layout = computeLayout(
      content({
        outputCables: [outputCable(4, [5])],
        bottomTerminalRow: [rowBlock(40, 0, 2)],
      }),
    )
    expect(layout.blocks.get(id(40))).toMatchObject({ y: 1550, h: 250, row: 'bottom' })
    expect(endpointPoint(layout, term(id(40), 0, 'top'))?.y).toBe(1550)
    expect(endpointPoint(layout, term(id(40), 0, 'bottom'))?.y).toBe(1800)
    expect(layout.height).toBe(1550 + 250 + 200)
  })
})

describe('drawing size with wide cable rows', () => {
  const wide = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      inputCable(100 + i, [200 + 4 * i, 201 + 4 * i, 202 + 4 * i, 203 + 4 * i]),
    )

  it('a top row wider than the rails widens the drawing', () => {
    const layout = computeLayout(content({ inputCables: wide(20), railWidthModules: 60 }))
    expect(layout.width).toBe(200 + 200 + 20 * 500 + 19 * 100)
  })

  it('the same cables on the left narrow it to the rails plus the column', () => {
    const layout = computeLayout(
      content({ inputCables: wide(20), inputCableSide: 'left', railWidthModules: 60 }),
    )
    expect(layout.width).toBe(200 + 600 + 60 * 175)
  })

  it('a bottom row wider than the rails widens it as well', () => {
    const layout = computeLayout(
      content({ inputCables: wide(20), inputCableSide: 'bottom', railWidthModules: 60 }),
    )
    expect(layout.width).toBe(200 + 200 + 20 * 500 + 19 * 100)
  })

  it('a right column adds a gap and a box width', () => {
    const layout = computeLayout(content({ inputCableSide: 'right', railWidthModules: 24 }))
    expect(layout.width).toBe(200 + 200 + 24 * 175 + 150 + 250)
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
      layout.outTop,
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
    expect(b.elements.get(id(20))?.x).toBe(600 + 2 * 175)
    expect(back.elements.get(id(20))?.x).toBe(200 + 2 * 175)
    expect(a.rails[0]?.x).toBe(200)
    expect(b.rails[0]?.x).toBe(600)
    expect(b.blocks.get(id(40))?.x).toBe(600 + 175)
  })

  it('a cable box follows its side (same cable object)', () => {
    const cable = inputCable(1, [2, 3])
    const base = content({ inputCables: [cable] })
    expect(computeLayout(base).inputBoxes[0]).toMatchObject({ side: 'top', w: 300, h: 250 })
    const left = computeLayout({ ...base, inputCableSide: 'left' })
    expect(left.inputBoxes[0]).toMatchObject({ side: 'left', w: 250, h: 300, x: 200, y: 600 })
    expect(computeLayout(base).inputBoxes[0]).toMatchObject({ side: 'top', w: 300, h: 250 })
  })

  it('a layout of a content with a side change equals a fresh layout of an unshared copy', () => {
    const c = sideContent('right', 'left', { rails: [rail(10, 24, 150, [element(20, 0, 2, 2)])] })
    computeLayout(sideContent('top', 'bottom', { rails: c.rails, inputCables: c.inputCables }))
    expect(computeLayout(c)).toEqual(computeLayout(structuredClone(c)))
  })
})
