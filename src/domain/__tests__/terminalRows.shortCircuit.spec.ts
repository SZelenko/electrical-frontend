/** The short-circuit check with two terminal rows and cable sides. Success + Error. */
import { describe, expect, it } from 'vitest'
import { checkShortCircuits } from '../shortCircuit'
import { CABLE_SIDES } from '../panelContent'
import { content, cw, id, inputCable, panelWire, rowBlock, term } from './helpers'

const A = id(2)
const B = id(3)

const panel = (over: Parameters<typeof content>[0]) =>
  content({ inputCables: [inputCable(1, [2, 3])], ...over })

describe('bottom terminal row', () => {
  it('a bottom-row block joins all its contacts: two sources on one block are a short circuit', () => {
    const c = panel({
      bottomTerminalRow: [rowBlock(50, 0, 4)],
      wires: [
        panelWire(30, cw(A), term(id(50), 0, 'top')),
        panelWire(31, cw(B), term(id(50), 3, 'bottom')),
      ],
    })
    const groups = checkShortCircuits(c)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sources).toEqual([A, B])
    expect(groups[0]?.wireIds).toEqual([id(30), id(31)])
  })

  it('one source on a bottom-row block is not a short circuit', () => {
    const c = panel({
      bottomTerminalRow: [rowBlock(50, 0, 4)],
      wires: [
        panelWire(30, cw(A), term(id(50), 0, 'top')),
        panelWire(31, cw(A), term(id(50), 2, 'top')),
      ],
    })
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('the side the wire attaches to does not matter (top and bottom contact are one node)', () => {
    const c = panel({
      bottomTerminalRow: [rowBlock(50, 0, 2)],
      wires: [
        panelWire(30, cw(A), term(id(50), 0, 'top')),
        panelWire(31, cw(B), term(id(50), 0, 'bottom')),
      ],
    })
    expect(checkShortCircuits(c)).toHaveLength(1)
  })
})

describe('two rows are two separate bars', () => {
  it('same offset and same contact index in both rows are not joined (no false join)', () => {
    const c = panel({
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(51, 0, 2)],
      wires: [
        panelWire(30, cw(A), term(id(50), 0, 'top')),
        panelWire(31, cw(B), term(id(51), 0, 'top')),
      ],
    })
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('a wire from a top-row block to a bottom-row block joins them', () => {
    const c = panel({
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(51, 5, 2)],
      wires: [
        panelWire(30, cw(A), term(id(50), 0, 'top')),
        panelWire(31, cw(B), term(id(51), 1, 'bottom')),
        panelWire(32, term(id(50), 1, 'bottom'), term(id(51), 0, 'top')),
      ],
    })
    const groups = checkShortCircuits(c)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sources).toEqual([A, B])
    expect(groups[0]?.wireIds).toEqual([id(30), id(31), id(32)])
  })

  it('without the joining wire the same panel has no short circuit (error control)', () => {
    const c = panel({
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(51, 5, 2)],
      wires: [
        panelWire(30, cw(A), term(id(50), 0, 'top')),
        panelWire(31, cw(B), term(id(51), 1, 'bottom')),
      ],
    })
    expect(checkShortCircuits(c)).toEqual([])
  })
})

describe('cable sides are drawing-only', () => {
  const wires = [
    panelWire(30, cw(A), term(id(50), 0, 'top')),
    panelWire(31, cw(B), term(id(50), 1, 'top')),
  ]
  const result = (input: (typeof CABLE_SIDES)[number], output: (typeof CABLE_SIDES)[number]) =>
    checkShortCircuits(
      panel({
        inputCableSide: input,
        outputCableSide: output,
        terminalRow: [rowBlock(50, 0, 2)],
        wires,
      }),
    )

  it.each(CABLE_SIDES.flatMap((i) => CABLE_SIDES.map((o) => [i, o] as const)))(
    'inputs %s, outputs %s give the same result as the defaults',
    (input, output) => {
      expect(result(input, output)).toEqual(result('top', 'bottom'))
      expect(result(input, output)).toHaveLength(1)
    },
  )
})
