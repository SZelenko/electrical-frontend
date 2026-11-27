/** Stage 5: the short-circuit check through busbars, incl. the tolerant behaviour on invalid busbars. */
import { describe, expect, it } from 'vitest'
import { checkShortCircuits } from '../shortCircuit'
import type { PanelWire } from '../panelContent'
import {
  ats,
  block,
  busbar,
  content,
  cw,
  element,
  feed,
  id,
  inputCable,
  panelWire,
  pole,
  rail,
} from './helpers'

const A = id(2)
const B = id(3)
const w = (n: number, s: ReturnType<typeof cw>, e: ReturnType<typeof cw>): PanelWire =>
  panelWire(n, s, e)
const dev = (n: number, offset: number, poles = 2, over = {}) => element(n, offset, 1, poles, over)

function panel(
  elements: ReturnType<typeof element>[],
  busbars: ReturnType<typeof busbar>[],
  wires: PanelWire[],
  extraBlocks: ReturnType<typeof block>[] = [],
  extraAts: ReturnType<typeof ats>[] = [],
) {
  return content({
    inputCables: [inputCable(1, [2, 3])],
    rails: [rail(10, 24, 150, [...elements, ...extraAts], extraBlocks, busbars)],
    wires,
  })
}

describe('busbar L: joins pole 0 inputs of the covered devices', () => {
  const d = [dev(20, 0), dev(21, 1), dev(22, 2)]
  const bar = [busbar(60, 'L', id(20), 2)]

  it('two sources on two covered devices are short-circuited', () => {
    const c = panel(d, bar, [
      w(30, cw(A), pole(id(20), 0, 'input')),
      w(31, cw(B), pole(id(21), 0, 'input')),
    ])
    const groups = checkShortCircuits(c)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sources).toEqual([A, B])
    expect(groups[0]?.wireIds).toEqual([id(30), id(31)])
  })

  it('a device beyond the count is not joined (no short circuit)', () => {
    const c = panel(d, bar, [
      w(30, cw(A), pole(id(20), 0, 'input')),
      w(31, cw(B), pole(id(22), 0, 'input')),
    ])
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('a source on the feed plus another on a covered input is a short circuit; the group lists the feed', () => {
    const c = panel(d, bar, [w(30, cw(A), feed(id(60), 0)), w(31, cw(B), pole(id(21), 0, 'input'))])
    const [g] = checkShortCircuits(c)
    expect(g?.sources).toEqual([A, B])
    expect(g?.terminals).toContainEqual({ kind: 'busbar', busbarId: id(60), feedIndex: 0 })
  })

  it('the busbar does not reach the output side (the device is off)', () => {
    const off = [dev(20, 0), dev(21, 1, 2, { on: false }), dev(22, 2)]
    const c = panel(off, bar, [
      w(30, cw(A), feed(id(60), 0)),
      w(31, cw(B), pole(id(21), 0, 'output')),
    ])
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('a feed alone with one source is fine', () => {
    expect(checkShortCircuits(panel(d, bar, [w(30, cw(A), feed(id(60), 0))]))).toEqual([])
  })

  it('terminals are sorted by node key: b: before p: before w:', () => {
    const c = panel(d, bar, [w(30, cw(A), feed(id(60), 0)), w(31, cw(B), pole(id(21), 0, 'input'))])
    expect(checkShortCircuits(c)[0]?.terminals.map((t) => t.kind)).toEqual([
      'busbar',
      'pole',
      'cableWire',
      'cableWire',
    ])
  })
})

describe('busbar LN: feed N joins pole 1 of devices with two or more poles', () => {
  const bar = [busbar(60, 'LN', id(20), 2)]
  it('sources on L and N are not joined with each other', () => {
    const c = panel([dev(20, 0), dev(21, 1)], bar, [
      w(30, cw(A), feed(id(60), 0)),
      w(31, cw(B), feed(id(60), 1)),
    ])
    expect(checkShortCircuits(c)).toEqual([])
  })
  it('a wire between L and N is a short circuit', () => {
    const c = panel([dev(20, 0), dev(21, 1)], bar, [
      w(30, cw(A), feed(id(60), 0)),
      w(31, cw(B), feed(id(60), 1)),
      w(32, feed(id(60), 0), feed(id(60), 1)),
    ])
    const [g] = checkShortCircuits(c)
    expect(g?.wireIds).toEqual([id(30), id(31), id(32)])
  })
  it('N joins pole 1 of a covered device (source on N and on p1.in is a short)', () => {
    const c = panel([dev(20, 0), dev(21, 1)], bar, [
      w(30, cw(A), feed(id(60), 1)),
      w(31, cw(B), pole(id(21), 1, 'input')),
    ])
    expect(checkShortCircuits(c)).toHaveLength(1)
  })
  it('N does not touch pole 0', () => {
    const c = panel([dev(20, 0), dev(21, 1)], bar, [
      w(30, cw(A), feed(id(60), 1)),
      w(31, cw(B), pole(id(21), 0, 'input')),
    ])
    expect(checkShortCircuits(c)).toEqual([])
  })
  it('a 1-pole covered device is not joined to N', () => {
    const c = panel([dev(20, 0, 1), dev(21, 1, 1)], bar, [
      w(30, cw(A), feed(id(60), 1)),
      w(31, cw(B), pole(id(21), 0, 'input')),
    ])
    expect(checkShortCircuits(c)).toEqual([])
  })
  it('poles 2 and 3 of a 4-pole device are never joined; pole 1 is', () => {
    const four = [element(20, 0, 1, 4), dev(21, 1)]
    const mk = (pi: number) =>
      panel(four, bar, [w(30, cw(A), feed(id(60), 0)), w(31, cw(B), pole(id(20), pi, 'input'))])
    expect(checkShortCircuits(mk(2))).toEqual([])
    expect(checkShortCircuits(mk(3))).toEqual([])
    expect(checkShortCircuits(mk(0))).toHaveLength(1)
    const n = panel(four, bar, [
      w(30, cw(A), feed(id(60), 1)),
      w(31, cw(B), pole(id(20), 1, 'input')),
    ])
    expect(checkShortCircuits(n)).toHaveLength(1)
  })
  it('an L busbar never joins pole 1', () => {
    const c = panel(
      [dev(20, 0), dev(21, 1)],
      [busbar(60, 'L', id(20), 2)],
      [w(30, cw(A), feed(id(60), 0)), w(31, cw(B), pole(id(21), 1, 'input'))],
    )
    expect(checkShortCircuits(c)).toEqual([])
  })
})

describe('busbar and the on/off state of the covered device', () => {
  const wires = [w(30, cw(A), feed(id(60), 0)), w(31, cw(B), pole(id(20), 0, 'output'))]
  const bar = [busbar(60, 'L', id(20), 2)]
  it('off: feed L and the pole output are separate', () => {
    expect(
      checkShortCircuits(panel([dev(20, 0, 2, { on: false }), dev(21, 1)], bar, wires)),
    ).toEqual([])
  })
  it('on: the device conducts input to output and the sources meet', () => {
    expect(checkShortCircuits(panel([dev(20, 0), dev(21, 1)], bar, wires))).toHaveLength(1)
  })
  it('off but pole 0 transit: conducts', () => {
    const off = dev(20, 0, 2, { on: false, poles: [{ transit: true }, { transit: false }] })
    expect(checkShortCircuits(panel([off, dev(21, 1)], bar, wires))).toHaveLength(1)
  })
  it('sidesSwapped on all covered devices gives the same result', () => {
    const sw = [dev(20, 0, 2, { sidesSwapped: true }), dev(21, 1, 2, { sidesSwapped: true })]
    expect(checkShortCircuits(panel(sw, bar, wires))).toHaveLength(1)
  })
})

describe('tolerance: an invalid busbar joins only the devices of its computed covered set', () => {
  const wires = (anchorPole: number) => [
    w(30, cw(A), feed(id(60), 0)),
    w(31, cw(B), pole(id(anchorPole), 0, 'input')),
  ]

  it('a count beyond the rail items covers the devices that exist (no throw)', () => {
    const c = panel([dev(20, 0), dev(21, 1)], [busbar(60, 'L', id(20), 9)], wires(21))
    expect(checkShortCircuits(c)).toHaveLength(1)
  })

  it('a gap does not stop the join', () => {
    const c = panel([dev(20, 0), dev(21, 3)], [busbar(60, 'L', id(20), 2)], wires(21))
    expect(checkShortCircuits(c)).toHaveLength(1)
  })

  it('mixed sidesSwapped does not stop the join', () => {
    const c = panel(
      [dev(20, 0), dev(21, 1, 2, { sidesSwapped: true })],
      [busbar(60, 'L', id(20), 2)],
      wires(21),
    )
    expect(checkShortCircuits(c)).toHaveLength(1)
  })

  it('an ATS in the covered set is skipped, devices after it are still joined', () => {
    const c = panel(
      [dev(20, 0), dev(22, 3)],
      [busbar(60, 'L', id(20), 3)],
      [...wires(22), w(32, cw(A), pole(id(23), 0, 'input'))],
      [],
      [ats(23, 1, 2)],
    )
    expect(checkShortCircuits(c)).toHaveLength(1)
  })

  it('a terminal block in the covered set is skipped without error', () => {
    const c = panel([dev(20, 0), dev(21, 2)], [busbar(60, 'L', id(20), 3)], wires(21), [
      block(40, 1, 1, 2),
    ])
    expect(checkShortCircuits(c)).toHaveLength(1)
  })

  it('a missing anchor joins nothing and does not throw', () => {
    const c = panel([dev(20, 0), dev(21, 1)], [busbar(60, 'L', id(99), 2)], wires(21))
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('devices beyond the (clamped) covered set stay separate', () => {
    const c = panel([dev(20, 0), dev(21, 1), dev(22, 2)], [busbar(60, 'L', id(20), 2)], wires(22))
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('does not mutate the content', () => {
    const c = panel([dev(20, 0), dev(21, 1)], [busbar(60, 'LN', id(20), 2)], wires(21))
    const snapshot = structuredClone(c)
    checkShortCircuits(c)
    expect(c).toEqual(snapshot)
  })
})
