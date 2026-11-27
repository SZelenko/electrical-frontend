/** Stage 5 commands: busbars and their cascades, rail width, row shift/overflow, labels, default colours. */
import { describe, expect, it } from 'vitest'
import {
  addBlock,
  addBusbar,
  addCableWire,
  addElement,
  addInputCable,
  addOutputCable,
  addRail,
  addRowBlock,
  copyItem,
  moveItem,
  removeBusbar,
  removeCableWire,
  removeElement,
  removeInputCable,
  removeRail,
  setRailWidth,
  updateBusbar,
  updateElement,
  updateInputCable,
  updateOutputCable,
} from '../commands'
import { MAX_BUSBARS_PER_RAIL } from '../limits'
import { computeLayout, endpointDirection, endpointPoint } from '../geometry'
import type { PanelContent, PanelWire } from '../panelContent'
import { autoRouteFor } from '../routes'
import { validateContent } from '../validateContent'
import { defaultWireColour } from '../wireDefaults'
import {
  addAuto,
  ats,
  block,
  busbar,
  content,
  cw,
  element,
  feed,
  id,
  inputCable,
  outputCable,
  panelWire,
  pole,
  rail,
  rejection,
  rowBlock,
  run,
  term,
} from './helpers'

const dev = (n: number, offset: number, poles = 2, over = {}) => element(n, offset, 1, poles, over)
const wireById = (c: PanelContent, n: number) => c.wires.find((x) => x.id === id(n)) as PanelWire
const autoOf = (c: PanelContent, n: number) => autoRouteFor(computeLayout(c), wireById(c, n))
function orthogonal(c: PanelContent): boolean {
  const l = computeLayout(c)
  return c.wires.every((x) => {
    const pts = [endpointPoint(l, x.start)!, ...x.bends, endpointPoint(l, x.end)!]
    return pts.every((a, i) => !pts[i + 1] || a.x === pts[i + 1]!.x || a.y === pts[i + 1]!.y)
  })
}

/**
 * C1 (id1: wires 2, 3), O1 (id4: wire 5); R1 id10: devices d20..d23 at 0..3 (d23 one pole),
 * busbar id60 LN anchored d20 covering d20..d22; R2 id11 empty.
 * W30 cw2 -> feed L, W31 cw3 -> feed N, W32 d22.p0 out -> cw5.
 */
function world(): PanelContent {
  let c = content({
    railWidthModules: 24,
    inputCables: [inputCable(1, [2, 3])],
    outputCables: [outputCable(4, [5])],
    rails: [
      rail(
        10,
        24,
        150,
        [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 3, 1)],
        [],
        [busbar(60, 'LN', id(20), 3)],
      ),
      rail(11, 24, 100),
    ],
  })
  for (const [n, s, e] of [
    [30, cw(id(2)), feed(id(60), 0)],
    [31, cw(id(3)), feed(id(60), 1)],
    [32, pole(id(22), 0, 'output'), cw(id(5))],
  ] as const) {
    c = run(c, addAuto(n, s, e)).content
  }
  return c
}

describe('the stage 5 world fixture', () => {
  it('is valid and its feed wires are orthogonal', () => {
    const w = world()
    expect(validateContent(w)).toEqual([])
    expect(orthogonal(w)).toBe(true)
  })
})

describe('addBusbar', () => {
  const four = () =>
    content({
      rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 3)])],
    })

  it('covers the longest run of free adjacent devices from the anchor (min 2)', () => {
    const out = run(four(), addBusbar({ id: id(60), type: 'L', firstElementId: id(20) })).content
    expect(out.rails[0]?.busbars).toEqual([
      { id: id(60), type: 'L', colour: null, firstElementId: id(20), count: 4 },
    ])
    expect(validateContent(out)).toEqual([])
  })

  it('anchored in the middle covers the rest to the right; the busbars stay ordered by anchor offset', () => {
    const one = run(four(), addBusbar({ id: id(61), type: 'LN', firstElementId: id(22) })).content
    const out = run(one, addBusbar({ id: id(60), type: 'L', firstElementId: id(20) })).content
    // d20 may only take d21 now (d22 is covered)
    expect(out.rails[0]?.busbars.map((b) => [b.id, b.count])).toEqual([
      [id(60), 2],
      [id(61), 2],
    ])
  })

  it('stops at a block, a gap or a different sidesSwapped', () => {
    const c = content({
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), dev(21, 1), dev(22, 3), dev(23, 4, 2, { sidesSwapped: true })],
          [block(40, 2, 1, 2)],
        ),
      ],
    })
    expect(
      run(c, addBusbar({ id: id(60), type: 'L', firstElementId: id(20) })).content.rails[0]
        ?.busbars[0]?.count,
    ).toBe(2)
    expect(rejection(addBusbar({ id: id(60), type: 'L', firstElementId: id(22) })(c))).toBe(
      'busbarNoRoom',
    )
  })

  it.each([
    [
      'a lone device',
      'busbarNoRoom',
      () => content({ rails: [rail(10, 24, 150, [dev(20, 0)])] }),
      20,
    ],
    [
      'an ATS anchor',
      'busbarNoRoom',
      () =>
        content({
          rails: [
            rail(
              10,
              24,
              150,
              [element(20, 0, 2, 2), dev(21, 2)].map((e, i) =>
                i === 0 ? { ...e, kind: 'ats' as never } : e,
              ),
            ),
          ],
        }),
      20,
    ],
    ['an already covered anchor', 'busbarNoRoom', world, 21],
    ['an unknown anchor', 'notFound', four, 99],
  ] as const)('rejects %s', (_n, reason, make, anchor) => {
    expect(
      rejection(addBusbar({ id: id(61), type: 'L', firstElementId: id(anchor) })(make())),
    ).toBe(reason)
  })

  it('rejects a taken id and an unknown type', () => {
    expect(rejection(addBusbar({ id: id(21), type: 'L', firstElementId: id(20) })(four()))).toBe(
      'duplicateId',
    )
    expect(
      rejection(addBusbar({ id: id(60), type: 'X' as never, firstElementId: id(20) })(four())),
    ).toBe('invalid')
  })

  it('accepts 30 busbars on a rail and rejects the 31st (limit)', () => {
    const devices = Array.from({ length: 60 }, (_, i) => dev(100 + i, i, 1))
    let c = content({ railWidthModules: 60, rails: [rail(10, 60, 150, devices)] })
    for (let i = 0; i < 30; i++) {
      // addBusbar takes the longest free run; shrink it to two devices to leave room for the next
      c = run(c, addBusbar({ id: id(500 + i), type: 'L', firstElementId: id(100 + 2 * i) })).content
      c = run(c, updateBusbar(id(500 + i), { count: 2 })).content
    }
    expect(c.rails[0]?.busbars).toHaveLength(30)
    expect(rejection(addBusbar({ id: id(600), type: 'L', firstElementId: id(100) })(c))).toBe(
      'limit',
    )
  })

  it('leaves the original content untouched', () => {
    const c = four()
    const snapshot = structuredClone(c)
    run(c, addBusbar({ id: id(60), type: 'L', firstElementId: id(20) }))
    expect(c).toEqual(snapshot)
  })
})

describe('updateBusbar', () => {
  it('shrinks and grows the count within the free adjacent devices; keeps the wires', () => {
    const w = world()
    const small = run(w, updateBusbar(id(60), { count: 2 }))
    expect(small.content.rails[0]?.busbars[0]?.count).toBe(2)
    expect(small.removedWires).toBe(0)
    const big = run(w, updateBusbar(id(60), { count: 4 })).content
    expect(big.rails[0]?.busbars[0]?.count).toBe(4)
    expect(validateContent(big)).toEqual([])
  })

  it.each([
    ['count 1', 1],
    ['count 0', 0],
    ['a fractional count', 2.5],
    ['more than the free adjacent devices', 5],
  ])('rejects %s', (_n, count) => {
    expect(rejection(updateBusbar(id(60), { count })(world()))).toBe('busbarRange')
  })

  it('cannot grow over devices covered by another busbar', () => {
    const c = content({
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 3)],
          [],
          [busbar(60, 'L', id(20), 2), busbar(61, 'L', id(22), 2)],
        ),
      ],
    })
    expect(rejection(updateBusbar(id(60), { count: 3 })(c))).toBe('busbarRange')
  })

  it('LN to L deletes the wires on feed N only and reports them', () => {
    const out = run(world(), updateBusbar(id(60), { type: 'L' }))
    expect(out.removedWires).toBe(1)
    expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(32)])
    expect(out.content.rails[0]?.busbars[0]?.type).toBe('L')
    expect(validateContent(out.content)).toEqual([])
  })

  it('L to LN removes nothing', () => {
    const asL = run(world(), updateBusbar(id(60), { type: 'L' })).content
    const back = run(asL, updateBusbar(id(60), { type: 'LN' }))
    expect(back.removedWires).toBe(0)
  })

  it('no-op returns the same content; unknown id and bad type are rejected', () => {
    const w = world()
    expect(run(w, updateBusbar(id(60), { type: 'LN', count: 3 })).content).toBe(w)
    expect(rejection(updateBusbar(id(99), { count: 2 })(w))).toBe('notFound')
    expect(rejection(updateBusbar(id(60), { type: 'N' as never })(w))).toBe('invalid')
  })
})

describe('removeBusbar', () => {
  it('deletes the busbar and the wires on both feeds', () => {
    const out = run(world(), removeBusbar(id(60)))
    expect(out.removedWires).toBe(2)
    expect(out.content.rails[0]?.busbars).toEqual([])
    expect(out.content.wires.map((x) => x.id)).toEqual([id(32)])
    expect(validateContent(out.content)).toEqual([])
  })
  it('rejects an unknown busbar', () => {
    expect(rejection(removeBusbar(id(99))(world()))).toBe('notFound')
  })
})

describe('removeElement cascades into busbars', () => {
  it('deleting the last covered device reduces count by 1 and keeps the busbar valid', () => {
    const out = run(world(), removeElement(id(22)))
    expect(out.content.rails[0]?.busbars[0]).toMatchObject({ count: 2, firstElementId: id(20) })
    expect(out.removedWires).toBe(1) // W32 on d22 only
    expect(validateContent(out.content)).toEqual([])
  })

  it('deleting the anchor moves firstElementId to the next covered device', () => {
    const out = run(world(), removeElement(id(20)))
    expect(out.content.rails[0]?.busbars[0]).toMatchObject({ count: 2, firstElementId: id(21) })
    expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(31), id(32)]) // feed wires stay
  })

  it('deleting a middle covered device reduces count by 1 (the free module then makes it a gap)', () => {
    const out = run(world(), removeElement(id(21)))
    expect(out.content.rails[0]?.busbars[0]).toMatchObject({ count: 2, firstElementId: id(20) })
  })

  it('count < 2 removes the busbar and the wires on its feeds, all reported together', () => {
    const two = run(world(), updateBusbar(id(60), { count: 2 })).content
    const out = run(two, removeElement(id(21)))
    expect(out.content.rails[0]?.busbars).toEqual([])
    expect(out.removedWires).toBe(2) // both feed wires (d21 itself has no wire)
    expect(out.content.wires.map((x) => x.id)).toEqual([id(32)])
  })

  it('deleting the anchor of a 2-device busbar removes the busbar too', () => {
    const two = run(world(), updateBusbar(id(60), { count: 2 })).content
    const out = run(two, removeElement(id(20)))
    expect(out.content.rails[0]?.busbars).toEqual([])
    expect(out.content.wires.map((x) => x.id)).toEqual([id(32)])
  })

  it('deleting an uncovered device leaves the busbar object untouched', () => {
    const w = world()
    const out = run(w, removeElement(id(23))).content
    expect(out.rails[0]?.busbars[0]).toBe(w.rails[0]?.busbars[0])
  })

  it('is pure: the source content keeps its busbar', () => {
    const w = world()
    run(w, removeElement(id(21)))
    expect(w.rails[0]?.busbars[0]?.count).toBe(3)
  })
})

describe('moveItem and removeRail with busbars', () => {
  it('moving the anchor to another rail moves the busbar with it in the same command', () => {
    const out = run(world(), moveItem(id(20), id(11), 0)).content
    expect(out.rails[0]?.busbars).toEqual([])
    expect(out.rails[1]?.busbars.map((b) => b.id)).toEqual([id(60)])
    expect(out.wires.map((x) => x.id)).toEqual([id(30), id(31), id(32)])
    expect(orthogonal(out)).toBe(true) // the feed wires follow the moved feeds
    const b = computeLayout(out).busbars.get(id(60))
    expect(b?.railIndex).toBe(1)
  })

  it('moving a covered, non-anchor device keeps the busbar on its rail', () => {
    const out = run(world(), moveItem(id(21), id(11), 5)).content
    expect(out.rails[0]?.busbars.map((b) => b.id)).toEqual([id(60)])
    expect(out.rails[1]?.busbars).toEqual([])
  })

  it('moving the anchor within the rail keeps busbars ordered by anchor offset', () => {
    const c = content({
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), dev(21, 1), dev(22, 4), dev(23, 5)],
          [],
          [busbar(60, 'L', id(20), 2), busbar(61, 'L', id(22), 2)],
        ),
      ],
    })
    const out = run(c, moveItem(id(20), id(10), 8)).content
    expect(out.rails[0]?.busbars.map((b) => b.id)).toEqual([id(61), id(60)])
  })

  it('removeRail deletes its busbars and the wires on their feeds', () => {
    const out = run(world(), removeRail(id(10)))
    expect(out.content.rails.map((r) => r.id)).toEqual([id(11)])
    expect(out.removedWires).toBe(3) // 2 feed wires + W32 on d22
    expect(out.content.wires).toEqual([])
  })

  it('removing an empty rail with no busbars removes no wire', () => {
    expect(run(world(), removeRail(id(11))).removedWires).toBe(0)
  })
})

describe('sidesSwapped and copy with busbars', () => {
  it('toggling sidesSwapped on a covered device applies to all devices of the busbar (one command)', () => {
    const out = run(world(), updateElement(id(21), { sidesSwapped: true })).content
    expect(out.rails[0]?.elements.map((e) => e.sidesSwapped)).toEqual([true, true, true, false])
    expect(validateContent(out)).toEqual([])
    const l = computeLayout(out)
    expect(endpointDirection(l, feed(id(60), 0))).toBe('down')
    expect(orthogonal(out)).toBe(true)
  })

  it('toggling it back applies to all covered devices again', () => {
    const swapped = run(world(), updateElement(id(21), { sidesSwapped: true })).content
    const back = run(swapped, updateElement(id(20), { sidesSwapped: false })).content
    expect(back.rails[0]?.elements.map((e) => e.sidesSwapped)).toEqual([false, false, false, false])
  })

  it('toggling an uncovered device changes only that device', () => {
    const out = run(world(), updateElement(id(23), { sidesSwapped: true })).content
    expect(out.rails[0]?.elements.map((e) => e.sidesSwapped)).toEqual([false, false, false, true])
  })

  it('reducing the poles of a covered device leaves the busbar and its wires', () => {
    const out = run(world(), updateElement(id(21), { poleCount: 1 }))
    expect(out.removedWires).toBe(0)
    expect(out.content.rails[0]?.busbars[0]).toBe(
      world().rails[0]?.busbars[0] && out.content.rails[0]?.busbars[0],
    )
    expect(out.content.rails[0]?.busbars).toHaveLength(1)
  })

  it('copy never copies busbars: a copied anchor gets none, the original keeps its busbar', () => {
    const out = run(world(), copyItem(id(20), id(70), { railId: id(11) }, 0)).content
    expect(out.rails[1]?.elements.map((e) => e.id)).toEqual([id(70)])
    expect(out.rails[1]?.busbars).toEqual([])
    expect(out.rails[0]?.busbars.map((b) => b.id)).toEqual([id(60)])
    expect(out.wires).toHaveLength(3) // no wires copied
  })

  it('a busbar id is taken: addElement with that id is a duplicate', () => {
    expect(rejection(addElement(id(11), { ...dev(60, 0) })(world()))).toBe('duplicateId')
  })
})

describe('rail width (panel value)', () => {
  const w = () =>
    content({
      railWidthModules: 24,
      rails: [rail(10, 24, 150, [element(20, 8, 2, 2)])],
      terminalRow: [rowBlock(50, 4, 2)], // row start 2 (1-wire cable) -> occupies row modules [4, 5)
    })

  it('shrinks exactly to what the rail items and the row need', () => {
    // rail items need 10; the row needs rowStart 2 + 5 = 7
    expect(run(w(), setRailWidth(10)).content.railWidthModules).toBe(10)
    expect(rejection(setRailWidth(9)(w()))).toBe('railTooNarrow')
  })

  it('rejects a shrink that no longer fits the terminal row', () => {
    const c = content({
      railWidthModules: 24,
      terminalRow: [rowBlock(50, 4, 2)],
    })
    expect(run(c, setRailWidth(7)).content.railWidthModules).toBe(7)
    expect(rejection(setRailWidth(6)(c))).toBe('rowOverflow')
  })

  it.each([0, 61, 1.5, -2, Number.NaN])('rejects the invalid width %s', (v) => {
    expect(rejection(setRailWidth(v)(w()))).toBe('invalidSize')
  })

  it('growing is always accepted; the same width is a no-op', () => {
    const c = w()
    expect(run(c, setRailWidth(60)).content.railWidthModules).toBe(60)
    expect(run(c, setRailWidth(24)).content).toBe(c)
  })

  it('placement reads the panel value: a rail created later uses it too', () => {
    const narrow = run(content({ railWidthModules: 10 }), addRail({ id: id(10) })).content
    expect(rejection(addElement(id(10), element(20, 9, 2, 2))(narrow))).toBe('outOfRail')
    const wider = run(narrow, setRailWidth(30)).content
    expect(rejection(addElement(id(10), element(20, 9, 2, 2))(wider))).toBeNull()
    expect(rejection(addBlock(id(10), block(41, 10, 1, 2))(narrow))).toBe('outOfRail')
  })

  it('does not touch wires (same wire objects)', () => {
    const c = world()
    expect(run(c, setRailWidth(30)).content.wires).toBe(c.wires)
  })
})

describe('the terminal row moves with the input cables', () => {
  /** C1 has one wire (row starts at module 2); row block id50 at offset 20 (1 module), W1 cw -> row contact. */
  const rowWorld = (offset = 20) => {
    const c = content({
      railWidthModules: 24,
      inputCables: [inputCable(1, [2])],
      terminalRow: [rowBlock(50, offset, 2)],
      rails: [rail(10, 24, 150, [dev(20, 0)])],
    })
    return run(c, addAuto(30, term(id(50), 0, 'bottom'), pole(id(20), 0, 'input'))).content
  }

  it('adding an input cable shifts the row blocks; the wire follows and stays orthogonal', () => {
    const c = rowWorld(4)
    const before = computeLayout(c).blocks.get(id(50))!.x
    const out = run(c, addInputCable(inputCable(6, [7]))).content
    const layout = computeLayout(out)
    expect(layout.rowStartModules).toBe(4) // 200 + 100 + 200 -> ceil(600 / 175)
    expect(layout.blocks.get(id(50))!.x).toBe(before + 2 * 175)
    expect(out.terminalRow[0]?.offsetModules).toBe(4) // the stored offset is relative
    expect(wireById(out, 30).bends).toEqual(autoOf(out, 30))
    expect(orthogonal(out)).toBe(true)
  })

  it('removing an input cable shifts the row back', () => {
    const two = run(rowWorld(4), addInputCable(inputCable(6, [7]))).content
    const out = run(two, removeInputCable(id(6))).content
    expect(computeLayout(out).rowStartModules).toBe(2)
    expect(orthogonal(out)).toBe(true)
  })

  it('adding a cable wire (1 -> 2 wires) shifts the row by one module', () => {
    const out = run(rowWorld(4), addCableWire(id(1), { id: id(8), colour: 'blue' })).content
    expect(computeLayout(out).rowStartModules).toBe(3)
    expect(orthogonal(out)).toBe(true)
  })

  it('removing a cable wire shifts the row back and drops the wires on it', () => {
    const two = run(rowWorld(4), addCableWire(id(1), { id: id(8), colour: 'blue' })).content
    const out = run(two, removeCableWire(id(8))).content
    expect(computeLayout(out).rowStartModules).toBe(2)
  })

  it('rejects a new input cable that would push a row block past the capacity (content unchanged)', () => {
    const c = rowWorld(20) // [20, 21) within capacity 22; new start 4 -> capacity 20
    const out = addInputCable(inputCable(6, [7]))(c)
    expect(out).toMatchObject({ ok: false, reason: 'rowOverflow' })
  })

  it('rejects a new cable wire that would push a row block past the capacity', () => {
    const c = rowWorld(21) // [21, 22) -> exactly the capacity 22
    expect(rejection(addCableWire(id(1), { id: id(8), colour: 'blue' })(c))).toBe('rowOverflow')
  })

  it('accepts the change while the block still fits exactly', () => {
    const c = rowWorld(20) // capacity after the extra wire: 21, block ends at 21
    expect(rejection(addCableWire(id(1), { id: id(8), colour: 'blue' })(c))).toBeNull()
  })

  it('an output cable never shifts the row', () => {
    const c = rowWorld(21)
    expect(rejection(addOutputCable(outputCable(6, [7]))(c))).toBeNull()
  })

  it('cables can be added while the row is empty even when the capacity is not positive', () => {
    const c = content({ railWidthModules: 2, inputCables: [inputCable(1, [2])] })
    expect(rejection(addInputCable(inputCable(6, [7]))(c))).toBeNull()
  })

  it('a row block cannot be added when the capacity is zero or negative', () => {
    const c = content({ railWidthModules: 2, inputCables: [inputCable(1, [2])] })
    expect(rejection(addRowBlock(rowBlock(50, 0, 1))(c))).toBe('outOfRow')
  })
})

describe('cable labels (<= 16 code points)', () => {
  it('addInputCable / addOutputCable: 16 accepted, 17 rejected, counted in code points', () => {
    const c = content()
    const cable = (n: number, label: string) => ({ ...inputCable(n, [n + 1]), label })
    const out = (n: number, label: string) => ({ ...outputCable(n, [n + 1]), label })
    expect(rejection(addInputCable(cable(6, 'x'.repeat(16)))(c))).toBeNull()
    expect(rejection(addInputCable(cable(6, 'x'.repeat(17)))(c))).toBe('invalid')
    expect(rejection(addInputCable(cable(6, '😀'.repeat(16)))(c))).toBeNull()
    expect(rejection(addInputCable(cable(6, '😀'.repeat(17)))(c))).toBe('invalid')
    expect(rejection(addOutputCable(out(6, 'x'.repeat(16)))(c))).toBeNull()
    expect(rejection(addOutputCable(out(6, 'x'.repeat(17)))(c))).toBe('invalid')
  })

  it('updateInputCable / updateOutputCable change the label; 17 characters are rejected; unchanged is a no-op', () => {
    const c = content({ outputCables: [outputCable(4, [5])] })
    expect(run(c, updateInputCable(id(1), { label: 'Ввід' })).content.inputCables[0]?.label).toBe(
      'Ввід',
    )
    expect(
      run(c, updateOutputCable(id(4), { label: 'Світло' })).content.outputCables[0]?.label,
    ).toBe('Світло')
    expect(rejection(updateInputCable(id(1), { label: 'x'.repeat(17) })(c))).toBe('invalid')
    expect(rejection(updateOutputCable(id(4), { label: 'x'.repeat(17) })(c))).toBe('invalid')
    expect(run(c, updateInputCable(id(1), { label: '' })).content).toBe(c)
    expect(run(c, updateOutputCable(id(4), { label: '' })).content).toBe(c)
  })

  it('a label change does not move anything or touch wires', () => {
    const w = world()
    const out = run(w, updateInputCable(id(1), { label: 'L1' })).content
    expect(out.wires).toBe(w.wires)
    expect(out.rails).toBe(w.rails)
  })
})

describe('default wire colour from a feed', () => {
  const c = world()
  it('feed L is brown, feed N is blue', () => {
    expect(defaultWireColour(c, feed(id(60), 0), 'red')).toBe('brown')
    expect(defaultWireColour(c, feed(id(60), 1), 'red')).toBe('blue')
  })
  it('a feed wins over a colour of a wire already attached to it', () => {
    const redOnFeed: PanelContent = {
      ...c,
      wires: [{ ...panelWire(40, cw(id(2)), feed(id(60), 0)), colour: 'red' }],
    }
    expect(defaultWireColour(redOnFeed, feed(id(60), 0), 'black')).toBe('brown')
  })
  it('a cable wire start keeps its own colour and a coloured block still wins for blocks', () => {
    expect(defaultWireColour(c, cw(id(2)), 'red')).toBe('brown')
    const blue = content({
      rails: [rail(10, 24, 150, [], [{ ...block(40, 0, 1, 2), colour: 'green-yellow' }])],
    })
    expect(defaultWireColour(blue, term(id(40), 0), 'red')).toBe('green-yellow')
  })
  it('falls back to the toolbar colour for an unattached pole', () => {
    expect(defaultWireColour(c, pole(id(23), 0, 'input'), 'red')).toBe('red')
  })
})

describe('removeElement with clashing busbars (one covers the device, another is anchored on it)', () => {
  /** d20 d21 d22 d23 d24 at 0..4; A anchored d20 over 3 (d20..d22); B anchored d22 over `bCount`. Clash on d22. */
  function clash(bCount: number, extra: Partial<PanelContent['rails'][0]> = {}): PanelContent {
    let c = content({
      railWidthModules: 24,
      inputCables: [inputCable(1, [2, 3])],
      outputCables: [outputCable(4, [5])],
      rails: [
        {
          ...rail(
            10,
            24,
            150,
            [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 3), dev(24, 4)],
            [],
            [busbar(60, 'LN', id(20), 3), busbar(61, 'LN', id(22), bCount)],
          ),
          ...extra,
        },
      ],
    })
    for (const [n, s, e] of [
      [30, cw(id(2)), feed(id(61), 0)],
      [31, cw(id(3)), feed(id(61), 1)],
      [32, pole(id(22), 0, 'output'), cw(id(5))],
    ] as const) {
      c = run(c, addAuto(n, s, e)).content
    }
    return c
  }
  const bars = (c: PanelContent) =>
    c.rails[0]?.busbars.map((b) => [b.id, b.count, b.firstElementId])

  it('adjusts both: the covering one shrinks, the anchored one re-anchors to the next device', () => {
    const before = clash(3)
    const out = run(before, removeElement(id(22)))
    expect(bars(out.content)).toEqual([
      [id(60), 2, id(20)],
      [id(61), 2, id(23)],
    ])
    expect(out.removedWires).toBe(1) // only the wire on d22; the feed wires of B stay
    expect(out.content.wires.map((w) => w.id)).toEqual([id(30), id(31)])
  })

  it('drops the anchored busbar left with one device, reporting its feed wires with the pole wire', () => {
    const before = clash(2)
    const out = run(before, removeElement(id(22)))
    expect(bars(out.content)).toEqual([[id(60), 2, id(20)]])
    expect(out.removedWires).toBe(3) // two feed wires + the wire on d22
    expect(out.content.wires).toEqual([])
  })

  it('undo restores the items, both busbars and every wire (reference swap of the source)', () => {
    const before = clash(2)
    const out = run(before, removeElement(id(22)))
    expect(out.content).not.toBe(before)
    // commands are pure: the source content is untouched and is what undo restores
    expect(bars(before)).toEqual([
      [id(60), 3, id(20)],
      [id(61), 2, id(22)],
    ])
    expect(before.wires).toHaveLength(3)
    expect(before.rails[0]?.elements).toHaveLength(5)
  })

  it('never moves the anchor onto an ATS: it takes the next covered device', () => {
    const c = content({
      railWidthModules: 24,
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), ats(21, 1, 2), dev(22, 3), dev(23, 4)],
          [],
          [busbar(61, 'L', id(20), 4)],
        ),
      ],
    })
    const out = run(c, removeElement(id(20))).content
    // d20's busbar is invalid content (ATS inside); whatever it becomes, the anchor is a device
    for (const b of out.rails[0]!.busbars) {
      const anchor = out.rails[0]!.elements.find((e) => e.id === b.firstElementId)
      expect(anchor?.kind).toBe('device')
    }
  })

  it('never moves the anchor onto a terminal block: no device left means the busbar goes away', () => {
    const c = content({
      railWidthModules: 24,
      rails: [rail(10, 24, 150, [dev(20, 0)], [block(40, 1, 1, 2)], [busbar(61, 'L', id(20), 2)])],
    })
    const out = run(c, removeElement(id(20))).content
    expect(out.rails[0]?.busbars).toEqual([])
  })
})

describe('moveItem of a busbar anchor into a rail with the maximum busbars', () => {
  const full = (): PanelContent => {
    const elements = Array.from({ length: 60 }, (_, i) => dev(200 + i, i, 2))
    const busbars = Array.from({ length: MAX_BUSBARS_PER_RAIL }, (_, i) =>
      busbar(300 + i, 'L', id(200 + 2 * i), 2),
    )
    return content({
      railWidthModules: 60,
      rails: [
        rail(10, 60, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(20), 2)]),
        rail(11, 60, 100, elements, [], busbars),
      ],
    })
  }

  it('rejects with a limit and leaves the content unchanged', () => {
    const c = full()
    expect(c.rails[1]?.busbars).toHaveLength(MAX_BUSBARS_PER_RAIL)
    // the free tail module is not available (60 devices fill the rail), so shrink the target first
    const roomy: PanelContent = {
      ...c,
      rails: [c.rails[0]!, { ...c.rails[1]!, elements: c.rails[1]!.elements.slice(0, 59) }],
    }
    const outcome = moveItem(id(20), id(11), 59)(roomy)
    expect(rejection(outcome)).toBe('limit')
    expect(outcome.ok ? null : outcome.detail).toBe('busbars')
  })

  it('moving a non-anchor device into the full rail is not blocked by the busbar limit', () => {
    const c = full()
    const roomy: PanelContent = {
      ...c,
      rails: [c.rails[0]!, { ...c.rails[1]!, elements: c.rails[1]!.elements.slice(0, 59) }],
    }
    const out = moveItem(id(21), id(11), 59)(roomy)
    expect(out.ok).toBe(true)
  })

  it('moving the anchor into a rail one busbar below the limit succeeds and carries the busbar', () => {
    const c = full()
    const room: PanelContent = {
      ...c,
      rails: [
        c.rails[0]!,
        {
          ...c.rails[1]!,
          elements: c.rails[1]!.elements.slice(0, 59),
          busbars: c.rails[1]!.busbars.slice(0, MAX_BUSBARS_PER_RAIL - 1),
        },
      ],
    }
    const out = run(room, moveItem(id(20), id(11), 59)).content
    expect(out.rails[1]?.busbars).toHaveLength(MAX_BUSBARS_PER_RAIL)
    expect(out.rails[0]?.busbars).toEqual([])
  })
})
