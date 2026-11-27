import { describe, expect, it } from 'vitest'
import { checkShortCircuits } from '../shortCircuit'
import type { AtsState, PanelContent } from '../panelContent'
import {
  ats,
  content,
  cw,
  id,
  inputCable,
  panelWire,
  pole,
  rail,
  rowBlock,
  block,
  term,
} from './helpers'

const brown = id(2)
const blue = id(3)

/** ATS id21 on a rail; sources: brown on input 0 (line A phase), blue on input 2 (line B phase). */
function atsPanel(state: AtsState, extra: ReturnType<typeof panelWire>[] = [], swapped = false) {
  return content({
    inputCables: [inputCable(1, [2, 3])],
    rails: [rail(10, 24, 150, [ats(21, 0, 2, { state, sidesSwapped: swapped })])],
    wires: [
      panelWire(30, cw(brown), pole(id(21), 0, 'input')),
      panelWire(31, cw(blue), pole(id(21), 2, 'input')),
      ...extra,
    ],
  })
}
const shorts = (c: PanelContent) => checkShortCircuits(c)

describe('ATS conduction', () => {
  it.each(['A', 'B', 'off'] as const)(
    'state %s: two sources on in0 and in2 never short by themselves',
    (s) => {
      expect(shorts(atsPanel(s))).toEqual([])
    },
  )

  it('A joins in0-out0 and in1-out1: an external out0 -> in2 wire shorts the two sources', () => {
    const c = atsPanel('A', [panelWire(32, pole(id(21), 0, 'output'), pole(id(21), 2, 'input'))])
    const [g] = shorts(c)
    expect(g?.sources).toEqual([brown, blue])
    expect(g?.wireIds).toEqual([id(30), id(31), id(32)])
  })

  it('B joins in2-out0: the same external wire is then a loop of one source (no short)', () => {
    const c = atsPanel('B', [panelWire(32, pole(id(21), 0, 'output'), pole(id(21), 2, 'input'))])
    expect(shorts(c)).toEqual([])
  })

  it('off joins nothing: out0 -> in2 does not short', () => {
    const c = atsPanel('off', [panelWire(32, pole(id(21), 0, 'output'), pole(id(21), 2, 'input'))])
    expect(shorts(c)).toEqual([])
  })

  it('B: out0 -> out1 joins in2 (via out0) and in3 (via out1); sources on in2 and in3 short', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [ats(21, 0, 2, { state: 'B' })])],
      wires: [
        panelWire(30, cw(brown), pole(id(21), 2, 'input')),
        panelWire(31, cw(blue), pole(id(21), 3, 'input')),
        panelWire(32, pole(id(21), 0, 'output'), pole(id(21), 1, 'output')),
      ],
    })
    expect(shorts(c)).toHaveLength(1)
  })

  it('B: sources on in2 and in3 stay separate without a bridge', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [ats(21, 0, 2, { state: 'B' })])],
      wires: [
        panelWire(30, cw(brown), pole(id(21), 2, 'input')),
        panelWire(31, cw(blue), pole(id(21), 3, 'input')),
      ],
    })
    expect(shorts(c)).toEqual([])
  })

  it('A: in0 and in1 are never joined with each other (separate lines through the ATS)', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [ats(21, 0, 2)])],
      wires: [
        panelWire(30, cw(brown), pole(id(21), 0, 'input')),
        panelWire(31, cw(blue), pole(id(21), 1, 'input')),
      ],
    })
    expect(shorts(c)).toEqual([])
  })

  it.each(['A', 'B', 'off'] as const)('sidesSwapped does not change the result (state %s)', (s) => {
    const bridge = [panelWire(32, pole(id(21), 0, 'output'), pole(id(21), 2, 'input'))]
    expect(shorts(atsPanel(s, bridge, true))).toEqual(shorts(atsPanel(s, bridge, false)))
  })

  it('the group of an ATS panel lists its five contacts once, sorted by node key', () => {
    const c = atsPanel('A', [panelWire(32, pole(id(21), 0, 'output'), pole(id(21), 2, 'input'))])
    const [g] = shorts(c)
    expect(g?.terminals).toEqual([
      pole(id(21), 0, 'input'),
      pole(id(21), 0, 'output'),
      pole(id(21), 2, 'input'),
      cw(brown),
      cw(blue),
    ])
  })
})

describe('terminal blocks of both kinds', () => {
  it('a row block joins every contact, from top and bottom', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      terminalRow: [rowBlock(50, 0, 4)],
      wires: [
        panelWire(30, cw(brown), term(id(50), 0, 'top')),
        panelWire(31, cw(blue), term(id(50), 3, 'bottom')),
      ],
    })
    expect(shorts(c)).toHaveLength(1)
  })

  it('two row blocks do not join each other', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      terminalRow: [rowBlock(50, 0, 2), rowBlock(51, 4, 2)],
      wires: [
        panelWire(30, cw(brown), term(id(50), 0, 'top')),
        panelWire(31, cw(blue), term(id(51), 0, 'top')),
      ],
    })
    expect(shorts(c)).toEqual([])
  })

  it('a row bar chained to a rail bar through an ATS output shorts', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      terminalRow: [rowBlock(50, 0, 2)],
      rails: [rail(10, 24, 150, [ats(21, 0, 2)], [block(40, 6, 1, 3)])],
      wires: [
        panelWire(30, cw(brown), term(id(50), 0, 'bottom')),
        panelWire(31, term(id(50), 1, 'bottom'), pole(id(21), 0, 'input')),
        panelWire(32, pole(id(21), 0, 'output'), term(id(40), 0, 'left')),
        panelWire(33, term(id(40), 2, 'right'), cw(blue)),
      ],
    })
    const [g] = shorts(c)
    expect(g?.wireIds).toEqual([id(30), id(31), id(32), id(33)])
  })

  it('the contact side never reaches the group terminals (both sides of a contact list once, without a side)', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [], [block(40, 0, 1, 2)])],
      wires: [
        panelWire(30, cw(brown), term(id(40), 0, 'left')),
        panelWire(31, term(id(40), 0, 'right'), cw(blue)),
      ],
    })
    const [g] = shorts(c)
    const terminals = g?.terminals.filter((t) => t.kind === 'terminal')
    expect(terminals).toEqual([{ kind: 'terminal', terminalBlockId: id(40), terminalIndex: 0 }])
    expect(terminals?.[0]).not.toHaveProperty('contactSide')
  })
})
