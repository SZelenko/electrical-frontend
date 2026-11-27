import { describe, expect, it } from 'vitest'
import {
  addBlock,
  addCableWire,
  addElement,
  addInputCable,
  addOutputCable,
  addRail,
  addWire,
  defaultInputCable,
  defaultOutputCable,
  insertBend,
  moveBend,
  moveItem,
  removeBend,
  removeBlock,
  removeCableWire,
  removeElement,
  removeInputCable,
  removeOutputCable,
  removeRail,
  removeWire,
  resetRoute,
  setPoleTransit,
  updateBlock,
  updateCableWire,
  updateElement,
  updateInputCable,
  updateOutputCable,
  setRailWidth,
  updateRail,
  updateWire,
} from '../commands'
import { computeLayout, endpointPoint, type Pt } from '../geometry'
import type { PanelContent } from '../panelContent'
import { autoRouteFor } from '../routes'
import { validateContent } from '../validateContent'
import {
  block,
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
  addAuto,
} from './helpers'

const p = (x: number, y: number): Pt => ({ x, y })
const world = buildWorld()
const wireById = (c: PanelContent, n: number) => c.wires.find((x) => x.id === id(n))
const bendsOf = (c: PanelContent, n: number) => wireById(c, n)?.bends
const autoOf = (c: PanelContent, n: number) => autoRouteFor(computeLayout(c), wireById(c, n)!)

/** Ids of the wires whose drawn route (start, bends, end) has a diagonal segment. */
function diagonalWires(c: PanelContent): string[] {
  const layout = computeLayout(c)
  return c.wires
    .filter((w) => {
      const pts = [endpointPoint(layout, w.start)!, ...w.bends, endpointPoint(layout, w.end)!]
      return pts.some((a, i) => {
        const b = pts[i + 1]
        return b !== undefined && a.x !== b.x && a.y !== b.y
      })
    })
    .map((w) => w.id)
}
const isOrthogonal = (c: PanelContent) => diagonalWires(c).length === 0

/** Every surviving wire's drawn route is orthogonal. */
function expectOrthogonalRoutes(c: PanelContent) {
  expect(diagonalWires(c)).toEqual([])
}

describe('the world fixture itself', () => {
  it('is valid and has the hand-computed auto routes', () => {
    expect(validateContent(world)).toEqual([])
    expect(bendsOf(world, 30)).toEqual([p(300, 1050), p(288, 1050)])
    // rail-block contacts leave horizontally: the route takes a vertical channel left of the block
    expect(bendsOf(world, 33)).toEqual([p(125, 2763), p(125, 1550), p(988, 1550)])
    expectOrthogonalRoutes(world)
  })
})

describe('rails', () => {
  it('adds a rail with the default 150 mm (the width is a panel value) and no busbars', () => {
    const out = run(world, addRail({ id: id(12) }))
    expect(out.removedWires).toBe(0)
    expect(out.content.rails[2]).toEqual({
      id: id(12),
      spacingMm: 150,
      elements: [],
      terminalBlocks: [],
      busbars: [],
    })
  })

  it('shares every untouched subtree; a wire to the moved output row keeps its route when its channel does not depend on the end', () => {
    const { content: next } = run(world, addRail({ id: id(12) }))
    expect(next.inputCables).toBe(world.inputCables)
    expect(next.outputCables).toBe(world.outputCables)
    expect(next.rails[0]).toBe(world.rails[0])
    expect(next.rails[1]).toBe(world.rails[1])
    expect(next.wires[0]).toBe(world.wires[0])
    expect(next.wires[1]).toBe(world.wires[1])
    expect(next.wires[3]).toBe(world.wires[3])
    // W3 ends on the output cable, which moved down; both terminals leave upwards, so the channel
    // (above the higher stub) is unchanged and the wire keeps its identity
    expect(next.wires[2]).toBe(world.wires[2])
    expect(bendsOf(next, 32)).toEqual(autoOf(next, 32))
    expectOrthogonalRoutes(next)
  })

  it.each([
    ['custom spacing', { id: id(12), spacingMm: 99.9 }],
    ['zero spacing', { id: id(12), spacingMm: 0 }],
  ])('accepts %s', (_n, rail) => expect(run(world, addRail(rail)).content.rails).toHaveLength(3))

  it.each([
    ['spacing with 2 decimals', { id: id(12), spacingMm: 150.55 }, 'invalid'],
    ['negative spacing', { id: id(12), spacingMm: -1 }, 'invalid'],
    ['spacing above the limit', { id: id(12), spacingMm: 100000 }, 'invalid'],
    ['an id that is already taken (a cable)', { id: id(1) }, 'duplicateId'],
    ['an id that is already taken (a rail)', { id: id(10) }, 'duplicateId'],
  ])('rejects %s', (_n, spec, reason) => {
    expect(rejection(addRail(spec)(world))).toBe(reason)
  })

  it('rejects the 9th rail', () => {
    const eight = content({ rails: Array.from({ length: 8 }, (_, i) => rail(10 + i)) })
    expect(rejection(addRail({ id: id(99) })(eight))).toBe('limit')
    expect(
      run(content({ rails: eight.rails.slice(0, 7) }), addRail({ id: id(99) })).content.rails,
    ).toHaveLength(8)
  })

  describe('removeRail', () => {
    it('cascades the rail items and their wires in one step and reports the count', () => {
      const out = run(world, removeRail(id(11)))
      expect(out.removedWires).toBe(1) // W4 (B2.t1)
      expect(out.content.rails.map((r) => r.id)).toEqual([id(10)])
      expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(31), id(32)])
      expect(out.content.rails[0]).toBe(world.rails[0])
      expect(bendsOf(out.content, 32)).toEqual(autoOf(out.content, 32)) // output row moved up
      expectOrthogonalRoutes(out.content)
      expect(validateContent(out.content)).toEqual([])
    })

    it('removing the first rail cascades E1, E2, B1 and every wire that touches them', () => {
      const out = run(world, removeRail(id(10)))
      expect(out.removedWires).toBe(4)
      expect(out.content.wires).toEqual([])
      expect(out.content.rails.map((r) => r.id)).toEqual([id(11)])
    })

    it('removing an empty rail removes no wires', () => {
      const withEmpty = run(world, addRail({ id: id(12) })).content
      expect(run(withEmpty, removeRail(id(12))).removedWires).toBe(0)
    })

    it('rejects an unknown rail', () =>
      expect(rejection(removeRail(id(99))(world))).toBe('notFound'))
  })

  describe('updateRail', () => {
    const spaced = run(world, updateRail(id(10), { spacingMm: 160 })).content

    it('a spacing change translates wires whose both ends move together and re-routes the others', () => {
      expect(spaced.rails[0]?.spacingMm).toBe(160)
      // W2 (E1.out -> B1.t2): both on R1 -> rigid translation by +100 u
      expect(bendsOf(spaced, 31)).toEqual(bendsOf(world, 31)!.map((b) => p(b.x, b.y + 100)))
      // W4 (B2 on R2, E2 on R1): both shift by +100 -> rigid translation
      expect(bendsOf(spaced, 33)).toEqual(bendsOf(world, 33)!.map((b) => p(b.x, b.y + 100)))
      // W1 (cable wire fixed, E1 moves) is an untouched auto route -> re-routed
      expect(bendsOf(spaced, 30)).toEqual(autoOf(spaced, 30))
      expectOrthogonalRoutes(spaced)
    })

    it('changes only the rail it names (structural sharing)', () => {
      expect(spaced.rails[1]).toBe(world.rails[1])
      expect(spaced.rails[0]?.elements).toBe(world.rails[0]?.elements)
      expect(spaced.inputCables).toBe(world.inputCables)
    })

    it('widens and shrinks the panel-wide rail width down to the rightmost item end', () => {
      expect(run(world, setRailWidth(10)).content.railWidthModules).toBe(10)
      expect(run(world, setRailWidth(60)).content.railWidthModules).toBe(60)
    })

    it.each([
      ['below the rightmost item end', 8, 'railTooNarrow'],
      ['width 0', 0, 'invalidSize'],
      ['width 61', 61, 'invalidSize'],
    ])('rejects a rail width %s', (_n, width, reason) => {
      expect(rejection(setRailWidth(width)(world))).toBe(reason)
    })

    it.each([
      ['spacing with 2 decimals', { spacingMm: 150.05 }, 'invalid'],
      ['spacing -1', { spacingMm: -1 }, 'invalid'],
    ])('rejects %s', (_n, patch, reason) => {
      expect(rejection(updateRail(id(10), patch)(world))).toBe(reason)
    })

    it('an unchanged patch is a no-op returning the same content', () => {
      expect(updateRail(id(10), { spacingMm: 150 })(world)).toMatchObject({
        ok: true,
        content: world,
      })
      const out = run(world, updateRail(id(10), {}))
      expect(out.content).toBe(world)
    })

    it('rejects an unknown rail', () =>
      expect(rejection(updateRail(id(99), { spacingMm: 1 })(world))).toBe('notFound'))
  })
})

describe('elements', () => {
  describe('addElement', () => {
    it('inserts keeping the rail ordered by offset', () => {
      const { content: next } = run(world, addElement(id(10), element(22, 2, 2, 2)))
      expect(next.rails[0]?.elements.map((e) => e.id)).toEqual([id(20), id(22), id(21)])
      expect(next.rails[1]).toBe(world.rails[1])
      expect(next.wires).toBe(world.wires)
    })

    it('accepts boundary fits: touching neighbours and the rail end', () => {
      expect(rejection(addElement(id(10), element(22, 2, 2, 2))(world))).toBeNull()
      expect(rejection(addElement(id(10), element(22, 22, 2, 2))(world))).toBeNull()
    })

    it.each([
      ['overlapping an element', element(22, 1, 2, 2), 'overlap'],
      ['overlapping a terminal block', element(22, 7, 2, 2), 'overlap'],
      ['past the rail end', element(22, 23, 2, 2), 'outOfRail'],
      ['a negative offset', element(22, -1, 2, 2), 'negativeOffset'],
      ['5 poles on 1 module', element(22, 2, 1, 5), 'tooNarrowForPoles'],
      ['0 poles', element(22, 2, 1, 0), 'tooNarrowForPoles'],
      ['an existing id', element(20, 2, 1, 1), 'duplicateId'],
      ['an id used by a cable wire', { ...element(22, 2, 1, 1), id: id(3) }, 'duplicateId'],
      ['a 17-character label', element(22, 2, 1, 1, { label: 'x'.repeat(17) }), 'invalid'],
      ['a 7-character marking', element(22, 2, 1, 1, { marking: 'x'.repeat(7) }), 'invalid'],
      ['a 17-emoji label', element(22, 2, 1, 1, { label: '😀'.repeat(17) }), 'invalid'],
    ])('rejects %s', (_n, e, reason) => {
      expect(rejection(addElement(id(10), e)(world))).toBe(reason)
    })

    it('accepts a 16-emoji label (code points, not UTF-16 units) and a 4-pole 1-module element', () => {
      expect(
        rejection(
          addElement(
            id(10),
            element(22, 2, 1, 4, { label: '😀'.repeat(16), marking: 'ABCDEF' }),
          )(world),
        ),
      ).toBeNull()
    })

    it('rejects an unknown rail', () =>
      expect(rejection(addElement(id(99), element(22, 2))(world))).toBe('notFound'))
  })

  describe('updateElement', () => {
    it('removing a pole deletes only the wires on the removed pole and reports 1', () => {
      const out = run(world, updateElement(id(20), { poleCount: 1 }))
      expect(out.removedWires).toBe(1)
      expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(32), id(33)])
      expect(out.content.rails[0]?.elements[0]?.poles).toHaveLength(1)
      expect(validateContent(out.content)).toEqual([])
    })

    it('re-routes the wire whose terminal moved because the pole count changed', () => {
      const out = run(world, updateElement(id(20), { poleCount: 1 })).content
      // the single pole now sits at the element centre: floor((350 + 1) / 2) = 175 -> x 375
      expect(endpointPoint(computeLayout(out), pole(id(20), 0, 'input'))).toEqual(p(375, 1650))
      expect(bendsOf(out, 30)).toEqual([p(300, 1050), p(375, 1050)])
      expect(wireById(out, 32)).toBe(wireById(world, 32)) // untouched wire keeps its identity
      expectOrthogonalRoutes(out)
    })

    it('adding poles appends non-transit poles and removes no wire', () => {
      const out = run(world, updateElement(id(20), { poleCount: 4, widthModules: 1 }))
      expect(out.removedWires).toBe(0)
      expect(out.content.rails[0]?.elements[0]?.poles).toEqual([
        { transit: false },
        { transit: false },
        { transit: false },
        { transit: false },
      ])
    })

    it('keeps the existing poles (and their transit flags) when growing', () => {
      const withTransit = run(world, setPoleTransit(id(20), 1, true)).content
      const out = run(withTransit, updateElement(id(20), { poleCount: 3 })).content
      expect(out.rails[0]?.elements[0]?.poles).toEqual([
        { transit: false },
        { transit: true },
        { transit: false },
      ])
    })

    it('widening within the free space re-routes the wires on its poles', () => {
      const out = run(world, updateElement(id(20), { widthModules: 4 })).content // [0,4) touches E2
      expect(endpointPoint(computeLayout(out), pole(id(20), 0, 'input'))).toEqual(
        p(200 + 175, 1650),
      ) // 700/4 -> 175
      expect(bendsOf(out, 30)).toEqual(autoOf(out, 30))
      expectOrthogonalRoutes(out)
    })

    it.each([
      ['widening into the next element', { widthModules: 5 }, 'overlap'],
      ['widening past the rail', { widthModules: 25 }, 'outOfRail'],
      ['width 0', { widthModules: 0 }, 'invalidSize'],
      ['fractional width', { widthModules: 1.5 }, 'invalidSize'],
      ['9 poles on 2 modules', { poleCount: 9 }, 'tooNarrowForPoles'],
      [
        '5 poles when shrinking to 1 module',
        { widthModules: 1, poleCount: 5 },
        'tooNarrowForPoles',
      ],
      ['0 poles', { poleCount: 0 }, 'invalid'],
      ['1.5 poles', { poleCount: 1.5 }, 'invalid'],
      ['a 17-character label', { label: 'x'.repeat(17) }, 'invalid'],
      ['a 7-character marking', { marking: 'x'.repeat(7) }, 'invalid'],
    ])('rejects %s', (_n, patch, reason) => {
      expect(rejection(updateElement(id(20), patch)(world))).toBe(reason)
    })

    it('rejects shrinking below ceil(poles / 4)', () => {
      const five = run(world, updateElement(id(20), { poleCount: 5, widthModules: 2 })).content
      expect(rejection(updateElement(id(20), { widthModules: 1 })(five))).toBe('tooNarrowForPoles')
      expect(rejection(updateElement(id(20), { widthModules: 2 })(five))).toBeNull()
    })

    it('a text-only edit keeps all other subtrees shared', () => {
      const { content: next } = run(world, updateElement(id(20), { label: 'QF1', marking: 'Q1' }))
      expect(next.wires).toBe(world.wires)
      expect(next.rails[1]).toBe(world.rails[1])
      expect(next.rails[0]?.elements[1]).toBe(world.rails[0]?.elements[1])
      expect(next.rails[0]?.terminalBlocks).toBe(world.rails[0]?.terminalBlocks)
      expect(next.rails[0]?.elements[0]).toMatchObject({ label: 'QF1', marking: 'Q1' })
    })

    it('toggling on/off changes only that element', () => {
      const { content: next } = run(world, updateElement(id(21), { on: false }))
      expect(next.rails[0]?.elements[1]?.on).toBe(false)
      expect(next.rails[0]?.elements[0]).toBe(world.rails[0]?.elements[0])
      expect(next.wires).toBe(world.wires)
    })

    it('swapping the sides keeps the wires on the same logical terminals and flips their routes', () => {
      const out = run(world, updateElement(id(20), { sidesSwapped: true }))
      expect(out.removedWires).toBe(0)
      expect(wireById(out.content, 30)?.end).toEqual(pole(id(20), 0, 'input'))
      expect(wireById(out.content, 31)?.start).toEqual(pole(id(20), 1, 'output'))
      // input now at the bottom edge (288, 2550), leaving down: both stubs go down (2550 + 100)
      expect(bendsOf(out.content, 30)).toEqual([p(300, 2650), p(288, 2650)])
      // output now at the top edge (463, 1650), leaving up; B1.t2 is entered horizontally from the left
      expect(bendsOf(out.content, 31)).toEqual([p(463, 1550), p(1525, 1550), p(1525, 1838)])
      expectOrthogonalRoutes(out.content)
      expect(validateContent(out.content)).toEqual([])
    })

    it('an unchanged patch returns the same content', () => {
      expect(
        run(world, updateElement(id(20), { widthModules: 2, label: '', on: true })).content,
      ).toBe(world)
      expect(run(world, updateElement(id(20), {})).content).toBe(world)
    })

    it('rejects an unknown element', () =>
      expect(rejection(updateElement(id(99), { on: false })(world))).toBe('notFound'))
  })

  describe('setPoleTransit', () => {
    it('toggles one pole and nothing else', () => {
      const { content: next } = run(world, setPoleTransit(id(20), 1, true))
      expect(next.rails[0]?.elements[0]?.poles).toEqual([{ transit: false }, { transit: true }])
      expect(next.wires).toBe(world.wires)
      expect(next.rails[1]).toBe(world.rails[1])
    })
    it('is a no-op when the flag is unchanged', () => {
      expect(run(world, setPoleTransit(id(20), 0, false)).content).toBe(world)
    })
    it.each([
      ['unknown element', id(99), 0],
      ['pole index past the count', id(20), 2],
      ['negative pole index', id(20), -1],
    ])('rejects %s', (_n, elementId, index) => {
      expect(rejection(setPoleTransit(elementId, index, true)(world))).toBe('notFound')
    })
  })

  describe('removeElement', () => {
    it('deletes the element and every wire on any of its poles (count reported)', () => {
      const out = run(world, removeElement(id(20)))
      expect(out.removedWires).toBe(2)
      expect(out.content.wires).toEqual([world.wires[2], world.wires[3]])
      expect(out.content.rails[0]?.elements.map((e) => e.id)).toEqual([id(21)])
      expect(validateContent(out.content)).toEqual([])
    })
    it('rejects an unknown element', () =>
      expect(rejection(removeElement(id(99))(world))).toBe('notFound'))
  })
})

describe('terminal blocks', () => {
  describe('addBlock', () => {
    it('inserts ordered by offset and shares the rest', () => {
      const { content: next } = run(world, addBlock(id(11), block(42, 2, 1, 2)))
      expect(next.rails[1]?.terminalBlocks.map((b) => b.id)).toEqual([id(41), id(42)])
      expect(next.rails[0]).toBe(world.rails[0])
      const ordered = run(next, addBlock(id(11), block(43, 1, 1, 1))).content
      expect(ordered.rails[1]?.terminalBlocks.map((b) => b.id)).toEqual([id(41), id(43), id(42)])
    })

    it.each([
      ['13 contacts on a rail block', block(42, 2, 1, 13), 'limit'],
      ['0 contacts', block(42, 2, 1, 0), 'invalid'],
      ['a rail block 2 modules wide', block(42, 2, 2, 2), 'invalid'],
      ['an unknown colour', { ...block(42, 2, 1, 2), colour: 'pink' as never }, 'invalid'],
      ['a 17-character label', { ...block(42, 2, 1, 2), label: 'x'.repeat(17) }, 'invalid'],
      ['overlap', block(42, 0, 1, 1), 'overlap'],
      ['past the rail end', block(42, 24, 1, 1), 'outOfRail'],
      ['negative offset', block(42, -1, 1, 1), 'negativeOffset'],
      ['duplicate id', block(41, 5, 1, 1), 'duplicateId'],
    ])('rejects %s', (_n, b, reason) => {
      expect(rejection(addBlock(id(11), b)(world))).toBe(reason)
    })

    it('accepts up to 12 contacts on one module, a colour and a label', () => {
      expect(rejection(addBlock(id(11), block(42, 2, 1, 12))(world))).toBeNull()
      expect(
        rejection(addBlock(id(11), { ...block(42, 2, 1, 2), colour: 'blue', label: 'N' })(world)),
      ).toBeNull()
    })
  })

  describe('updateBlock', () => {
    it('removing terminals deletes the wires on the removed ones only', () => {
      const out = run(world, updateBlock(id(40), { terminalCount: 1 }))
      expect(out.removedWires).toBe(1) // W2 on t2; W3 on t0 stays
      expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(32), id(33)])
      // rail-block contacts keep their place when the count changes: W3 is untouched
      expect(wireById(out.content, 32)).toBe(wireById(world, 32))
      expect(endpointPoint(computeLayout(out.content), term(id(40), 0))).toEqual(p(1625, 1688))
      expectOrthogonalRoutes(out.content)
    })

    it('growing adds terminals without removing wires', () => {
      const out = run(world, updateBlock(id(40), { terminalCount: 4 }))
      expect(out.removedWires).toBe(0)
      expect(out.content.rails[0]?.terminalBlocks[0]?.terminalCount).toBe(4)
    })

    it.each([
      ['13 contacts on a rail block', { terminalCount: 13 }, 'limit'],
      ['0 contacts', { terminalCount: 0 }, 'invalid'],
      ['1.5 contacts', { terminalCount: 1.5 }, 'invalid'],
      ['a 17-character label', { label: 'x'.repeat(17) }, 'invalid'],
      ['an unknown colour', { colour: 'pink' as never }, 'invalid'],
    ])('rejects %s', (_n, patch, reason) => {
      expect(rejection(updateBlock(id(40), patch)(world))).toBe(reason)
    })

    it('sets and clears the colour and the label without touching wires', () => {
      const out = run(world, updateBlock(id(40), { colour: 'blue', label: 'N' }))
      expect(out.content.rails[0]?.terminalBlocks[0]).toMatchObject({ colour: 'blue', label: 'N' })
      expect(out.content.wires).toBe(world.wires)
      const cleared = run(out.content, updateBlock(id(40), { colour: null })).content
      expect(cleared.rails[0]?.terminalBlocks[0]?.colour).toBeNull()
    })

    it('an unchanged patch returns the same content', () => {
      expect(run(world, updateBlock(id(40), { terminalCount: 3 })).content).toBe(world)
    })

    it('rejects an unknown block', () =>
      expect(rejection(updateBlock(id(99), {})(world))).toBe('notFound'))
  })

  describe('removeBlock', () => {
    it('deletes the block and all wires on any terminal', () => {
      const out = run(world, removeBlock(id(40)))
      expect(out.removedWires).toBe(2)
      expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(33)])
      expect(out.content.rails[0]?.terminalBlocks).toEqual([])
    })
    it('rejects an unknown block', () =>
      expect(rejection(removeBlock(id(99))(world))).toBe('notFound'))
  })
})

describe('moveItem', () => {
  it('moves an element within its rail and re-routes the wires on its poles', () => {
    const out = run(world, moveItem(id(21), id(10), 6))
    expect(out.content.rails[0]?.elements.find((e) => e.id === id(21))?.offsetModules).toBe(6)
    expect(bendsOf(out.content, 33)).toEqual([p(125, 2763), p(125, 1550), p(1338, 1550)])
    expect(wireById(out.content, 30)).toBe(wireById(world, 30))
    expectOrthogonalRoutes(out.content)
  })

  it('keeps the rail ordered by offset when an item jumps over another', () => {
    const out = run(world, moveItem(id(20), id(10), 6)).content // E1 [6,8) is now right of E2 [4,5)
    expect(out.rails[0]?.elements.map((e) => e.id)).toEqual([id(21), id(20)])
    expect(validateContent(out)).toEqual([])
  })

  it('moves an element to another rail keeping its id and re-routing its wires', () => {
    const out = run(world, moveItem(id(21), id(11), 4))
    expect(out.removedWires).toBe(0)
    expect(out.content.rails[0]?.elements.map((e) => e.id)).toEqual([id(20)])
    expect(out.content.rails[1]?.elements.map((e) => e.id)).toEqual([id(21)])
    expect(out.content.rails[1]?.elements[0]?.offsetModules).toBe(4)
    expect(bendsOf(out.content, 33)).toEqual([p(125, 2763), p(125, 2550), p(988, 2550)])
    expect(out.content.wires.map((x) => x.id)).toEqual(world.wires.map((x) => x.id))
    expectOrthogonalRoutes(out.content)
    expect(validateContent(out.content)).toEqual([])
  })

  it('moves a terminal block to another rail keeping its id; its wires follow', () => {
    const out = run(world, moveItem(id(40), id(11), 5)).content
    expect(out.rails[0]?.terminalBlocks).toEqual([])
    expect(out.rails[1]?.terminalBlocks.map((b) => b.id)).toEqual([id(41), id(40)])
    expect(endpointPoint(computeLayout(out), term(id(40), 0))).toEqual(p(200 + 5 * 175 + 25, 2688))
    expect(bendsOf(out, 31)).toEqual(autoOf(out, 31))
    expect(bendsOf(out, 32)).toEqual(autoOf(out, 32))
    expectOrthogonalRoutes(out)
    expect(validateContent(out)).toEqual([])
  })

  it('sharing: a move within one rail leaves the other rail and the cables untouched', () => {
    const out = run(world, moveItem(id(21), id(10), 6)).content
    expect(out.rails[1]).toBe(world.rails[1])
    expect(out.inputCables).toBe(world.inputCables)
  })

  it('moving to the current place is a no-op returning the same content', () => {
    expect(run(world, moveItem(id(21), id(10), 4)).content).toBe(world)
  })

  it.each([
    ['onto a neighbour', id(20), id(10), 3, 'overlap'],
    ['onto a block of the target rail', id(21), id(11), 0, 'overlap'],
    ['past the rail end', id(21), id(10), 24, 'outOfRail'],
    ['to a negative offset', id(21), id(10), -1, 'negativeOffset'],
    ['to a fractional offset', id(21), id(10), 2.5, 'invalidSize'],
    ['to an unknown rail', id(21), id(99), 4, 'notFound'],
    ['an unknown item', id(99), id(10), 4, 'notFound'],
    ['a rail id as the item', id(10), id(10), 4, 'notFound'],
  ])('rejects moving %s', (_n, item, target, offset, reason) => {
    expect(rejection(moveItem(item, target, offset)(world))).toBe(reason)
  })

  it('rejects a move onto a narrower target rail', () => {
    const narrow = { ...world, railWidthModules: 3 }
    expect(rejection(moveItem(id(21), id(11), 3)(narrow))).toBe('outOfRail')
    expect(rejection(moveItem(id(21), id(11), 2)(narrow))).toBeNull()
  })

  it('the rejected outcome carries no content (the caller keeps the old reference)', () => {
    const out = moveItem(id(20), id(10), 3)(world)
    expect(out.ok).toBe(false)
    expect('content' in out).toBe(false)
  })
})

describe('input cables', () => {
  const two = run(world, addInputCable(inputCable(6, [7]))).content
  const wired = run(two, addAuto(34, cw(id(7)), pole(id(20), 1, 'input'))).content

  it('adds a cable at the end without disturbing anything', () => {
    expect(two.inputCables.map((c) => c.id)).toEqual([id(1), id(6)])
    expect(two.wires).toBe(world.wires)
    expect(two.rails).toBe(world.rails)
  })

  it('uses the defaults 230 V / 50 Hz / 4 mm² and one brown wire', () => {
    expect(defaultInputCable(id(6), id(7))).toEqual({
      id: id(6),
      label: '',
      voltage: 230,
      frequency: 50,
      crossSection: 4,
      wires: [{ id: id(7), colour: 'brown' }],
    })
    expect(defaultOutputCable(id(6), id(7))).toEqual({
      id: id(6),
      label: '',
      description: '',
      wires: [{ id: id(7), colour: 'brown' }],
    })
  })

  it.each([
    ['an existing id', { ...inputCable(6, [7]), id: id(1) }, 'duplicateId'],
    ['a wire id that is taken', inputCable(6, [2]), 'duplicateId'],
    ['two wires with the same id', inputCable(6, [7, 7]), 'duplicateId'],
    ['no wires', inputCable(6, []), 'limit'],
    ['5 wires', inputCable(6, [7, 8, 9, 12, 13]), 'limit'],
    ['voltage 0', { ...inputCable(6, [7]), voltage: 0 }, 'invalid'],
    ['voltage with 2 decimals', { ...inputCable(6, [7]), voltage: 230.55 }, 'invalid'],
    ['frequency with 3 decimals', { ...inputCable(6, [7]), frequency: 50.123 }, 'invalid'],
    ['cross-section 0', { ...inputCable(6, [7]), crossSection: 0 }, 'invalid'],
    [
      'an unknown colour',
      { ...inputCable(6, [7]), wires: [{ id: id(7), colour: 'pink' as never }] },
      'invalid',
    ],
  ])('rejects %s', (_n, cable, reason) => {
    expect(rejection(addInputCable(cable)(world))).toBe(reason)
  })

  it('rejects the 21st input cable and accepts the 20th', () => {
    const nineteen = content({
      inputCables: Array.from({ length: 19 }, (_, i) => inputCable(100 + i, [200 + i])),
    })
    const twenty = run(nineteen, addInputCable(inputCable(300, [301]))).content
    expect(twenty.inputCables).toHaveLength(20)
    expect(rejection(addInputCable(inputCable(400, [401]))(twenty))).toBe('limit')
  })

  it('accepts 4 wires in a cable', () => {
    expect(rejection(addInputCable(inputCable(6, [7, 8, 9, 12]))(world))).toBeNull()
  })

  describe('updateInputCable', () => {
    it('updates the label fields', () => {
      const c = run(
        world,
        updateInputCable(id(1), { voltage: 400, frequency: 60, crossSection: 2.5 }),
      ).content
      expect(c.inputCables[0]).toMatchObject({ voltage: 400, frequency: 60, crossSection: 2.5 })
      expect(c.rails).toBe(world.rails)
      expect(c.wires).toBe(world.wires)
    })
    it('ignores undefined patch keys instead of overwriting with undefined', () => {
      const c = run(world, updateInputCable(id(1), { voltage: 400, frequency: undefined })).content
      expect(c.inputCables[0]).toMatchObject({ voltage: 400, frequency: 50 })
    })
    it('an unchanged patch returns the same content', () => {
      expect(run(world, updateInputCable(id(1), { voltage: 230 })).content).toBe(world)
    })
    it.each([
      ['voltage 0', { voltage: 0 }],
      ['voltage 100000', { voltage: 100000 }],
      ['frequency 1000', { frequency: 1000 }],
      ['cross-section 0', { crossSection: 0 }],
    ])('rejects %s', (_n, patch) =>
      expect(rejection(updateInputCable(id(1), patch)(world))).toBe('invalid'),
    )
    it('rejects an unknown cable', () =>
      expect(rejection(updateInputCable(id(99), { voltage: 1 })(world))).toBe('notFound'))
  })

  describe('removeInputCable', () => {
    it('refuses to remove the last input cable', () => {
      expect(rejection(removeInputCable(id(1))(world))).toBe('lastInputCable')
    })

    it('removes the cable, cascades its wires and re-routes wires on the cables that shifted left', () => {
      const out = run(wired, removeInputCable(id(1)))
      expect(out.removedWires).toBe(1) // W1 on cw2
      expect(out.content.inputCables.map((c) => c.id)).toEqual([id(6)])
      expect(out.content.wires.map((x) => x.id)).toEqual([id(31), id(32), id(33), id(34)])
      // the C2 wire moved from x=700 to x=300
      expect(endpointPoint(computeLayout(out.content), cw(id(7)))).toEqual(p(300, 450))
      expect(bendsOf(out.content, 34)).toEqual(autoOf(out.content, 34))
      expectOrthogonalRoutes(out.content)
      expect(validateContent(out.content)).toEqual([])
    })

    it('rejects an unknown cable', () =>
      expect(rejection(removeInputCable(id(99))(wired))).toBe('notFound'))
  })
})

describe('output cables', () => {
  it('adds a cable with the default description', () => {
    const out = run(world, addOutputCable(outputCable(6, [7]))).content
    expect(out.outputCables.map((c) => c.id)).toEqual([id(4), id(6)])
    expect(out.rails).toBe(world.rails)
  })

  it.each([
    ['no wires', outputCable(6, []), 'limit'],
    ['5 wires', outputCable(6, [7, 8, 9, 12, 13]), 'limit'],
    ['a taken id', { ...outputCable(6, [7]), id: id(4) }, 'duplicateId'],
    [
      'a 256-character description',
      { ...outputCable(6, [7]), description: 'x'.repeat(256) },
      'invalid',
    ],
    [
      'a 256-emoji description',
      { ...outputCable(6, [7]), description: '😀'.repeat(256) },
      'invalid',
    ],
  ])('rejects %s', (_n, cable, reason) =>
    expect(rejection(addOutputCable(cable)(world))).toBe(reason),
  )

  it('accepts a 255-emoji description and the 100th cable, rejects the 101st', () => {
    expect(
      rejection(addOutputCable({ ...outputCable(6, [7]), description: '😀'.repeat(255) })(world)),
    ).toBeNull()
    const ninetyNine = content({
      outputCables: Array.from({ length: 99 }, (_, i) => outputCable(100 + i, [300 + i])),
    })
    const hundred = run(ninetyNine, addOutputCable(outputCable(500, [501]))).content
    expect(rejection(addOutputCable(outputCable(600, [601]))(hundred))).toBe('limit')
  })

  it('updates the description; an unchanged one is a no-op; a long one is rejected', () => {
    expect(
      run(world, updateOutputCable(id(4), { description: 'Розетки' })).content.outputCables[0]
        ?.description,
    ).toBe('Розетки')
    expect(run(world, updateOutputCable(id(4), { description: '' })).content).toBe(world)
    expect(rejection(updateOutputCable(id(4), { description: 'x'.repeat(256) })(world))).toBe(
      'invalid',
    )
    expect(rejection(updateOutputCable(id(99), { description: 'x' })(world))).toBe('notFound')
  })

  it('removing an output cable cascades the wires on its wires', () => {
    const out = run(world, removeOutputCable(id(4)))
    expect(out.removedWires).toBe(1) // W3
    expect(out.content.wires.map((x) => x.id)).toEqual([id(30), id(31), id(33)])
    expect(rejection(removeOutputCable(id(99))(world))).toBe('notFound')
  })

  it('an output cable before another shifts the later cable wires: wires on them are re-routed', () => {
    const two = run(world, addOutputCable(outputCable(6, [7]))).content
    const wired = run(two, addAuto(34, term(id(41), 0), cw(id(7)))).content
    const out = run(wired, removeOutputCable(id(4)))
    expect(out.removedWires).toBe(1)
    expect(endpointPoint(computeLayout(out.content), cw(id(7)))).toEqual(p(300, 3700))
    expect(bendsOf(out.content, 34)).toEqual(autoOf(out.content, 34))
    expectOrthogonalRoutes(out.content)
  })
})

describe('cable wires', () => {
  const two = run(world, addInputCable(inputCable(6, [7]))).content
  const wired = run(two, addAuto(34, cw(id(7)), pole(id(20), 1, 'input'))).content

  it('appends a wire to a cable; existing wires keep their position', () => {
    const out = run(world, addCableWire(id(1), { id: id(8), colour: 'red' })).content
    expect(out.inputCables[0]?.wires.map((x) => x.id)).toEqual([id(2), id(3), id(8)])
    expect(out.wires).toBe(world.wires)
  })

  it('adding a wire to an earlier cable shifts the later cables and re-routes wires on them', () => {
    const out = run(wired, addCableWire(id(1), { id: id(8), colour: 'red' })).content
    expect(endpointPoint(computeLayout(out), cw(id(7)))).toEqual(p(800, 450)) // was 700
    expect(bendsOf(out, 34)).toEqual(autoOf(out, 34))
    expectOrthogonalRoutes(out)
  })

  it('works on output cables too', () => {
    const out = run(world, addCableWire(id(4), { id: id(8), colour: 'blue' })).content
    expect(out.outputCables[0]?.wires.map((x) => x.id)).toEqual([id(5), id(8)])
  })

  it('rejects a 5th wire, a bad colour, a taken id and an unknown cable', () => {
    const four = run(world, addCableWire(id(1), { id: id(8), colour: 'red' })).content
    const full = run(four, addCableWire(id(1), { id: id(9), colour: 'red' })).content
    expect(rejection(addCableWire(id(1), { id: id(12), colour: 'red' })(full))).toBe('limit')
    expect(rejection(addCableWire(id(1), { id: id(8), colour: 'pink' as never })(world))).toBe(
      'invalid',
    )
    expect(rejection(addCableWire(id(1), { id: id(2), colour: 'red' })(world))).toBe('duplicateId')
    expect(rejection(addCableWire(id(99), { id: id(8), colour: 'red' })(world))).toBe('notFound')
  })

  describe('removeCableWire', () => {
    it('removes a wire that nothing is attached to without cascading', () => {
      const out = run(world, removeCableWire(id(3)))
      expect(out.removedWires).toBe(0)
      expect(out.content.inputCables[0]?.wires.map((x) => x.id)).toEqual([id(2)])
    })

    it('cascades the panel wires attached to the removed cable wire', () => {
      const out = run(world, removeCableWire(id(2)))
      expect(out.removedWires).toBe(1)
      expect(out.content.wires.map((x) => x.id)).toEqual([id(31), id(32), id(33)])
      expect(out.content.inputCables[0]?.wires.map((x) => x.id)).toEqual([id(3)])
    })

    it('shifts the remaining wires left and re-routes the wires on them', () => {
      const withOnBlue = run(world, addAuto(34, cw(id(3)), pole(id(21), 0, 'input'))).content
      const out = run(withOnBlue, removeCableWire(id(2)))
      expect(endpointPoint(computeLayout(out.content), cw(id(3)))).toEqual(p(300, 450))
      expect(bendsOf(out.content, 34)).toEqual(autoOf(out.content, 34))
      expectOrthogonalRoutes(out.content)
    })

    it('refuses to remove the last wire of an input or an output cable', () => {
      expect(rejection(removeCableWire(id(5))(world))).toBe('lastCableWire')
      const single = content()
      expect(rejection(removeCableWire(id(2))(single))).toBe('lastCableWire')
    })

    it('rejects an unknown wire', () =>
      expect(rejection(removeCableWire(id(99))(world))).toBe('notFound'))
  })

  describe('updateCableWire', () => {
    it('changes the colour only', () => {
      const out = run(world, updateCableWire(id(3), { colour: 'green-yellow' })).content
      expect(out.inputCables[0]?.wires[1]).toEqual({ id: id(3), colour: 'green-yellow' })
      expect(out.inputCables[0]?.wires[0]).toBe(world.inputCables[0]?.wires[0])
      expect(out.wires).toBe(world.wires)
    })
    it('is a no-op for the same colour', () => {
      expect(run(world, updateCableWire(id(3), { colour: 'blue' })).content).toBe(world)
    })
    it('rejects an unknown colour and an unknown wire', () => {
      expect(rejection(updateCableWire(id(3), { colour: 'pink' as never })(world))).toBe('invalid')
      expect(rejection(updateCableWire(id(99), { colour: 'red' })(world))).toBe('notFound')
    })
  })
})

describe('panel wires', () => {
  describe('addWire', () => {
    const base = run(world, addInputCable(inputCable(6, [7, 8]))).content

    it('appends the wire with the automatic orthogonal route stored as bends', () => {
      const out = run(base, addAuto(34, cw(id(7)), pole(id(21), 0, 'input'))).content
      expect(out.wires).toHaveLength(5)
      const added = out.wires[4]!
      expect(added.id).toBe(id(34))
      expect(added.bends).toEqual(autoOf(out, 34))
      expect(added.bends.length).toBeLessThanOrEqual(4)
      expect(out.wires.slice(0, 4)).toEqual(base.wires)
      expect(out.wires[0]).toBe(base.wires[0])
      expectOrthogonalRoutes(out)
      expect(validateContent(out)).toEqual([])
    })

    it('stores no bends when the terminals line up vertically', () => {
      const lined = content({
        inputCables: [inputCable(1, [2, 3])],
        outputCables: [outputCable(4, [5, 6])],
      })
      const out = run(lined, addAuto(30, cw(id(3)), cw(id(6)))).content
      expect(out.wires[0]?.bends).toEqual([])
    })

    it.each([
      ['the same terminal on both ends', newWire(34, cw(id(7)), cw(id(7))), 'sameTerminal'],
      [
        'the same pole terminal',
        newWire(34, pole(id(20), 0, 'input'), pole(id(20), 0, 'input')),
        'sameTerminal',
      ],
      ['an unknown start', newWire(34, cw(id(99)), cw(id(7))), 'notFound'],
      ['an unknown element', newWire(34, pole(id(99), 0, 'input'), cw(id(7))), 'notFound'],
      ['a pole index past the count', newWire(34, pole(id(20), 5, 'input'), cw(id(7))), 'notFound'],
      ['a terminal index past the count', newWire(34, term(id(41), 2), cw(id(7))), 'notFound'],
      ['a taken id', newWire(30, cw(id(7)), cw(id(8))), 'duplicateId'],
      [
        'an invalid colour',
        { ...newWire(34, cw(id(7)), cw(id(8))), colour: 'pink' as never },
        'invalid',
      ],
      [
        'an invalid cross-section',
        { ...newWire(34, cw(id(7)), cw(id(8))), crossSection: '3' as never },
        'invalid',
      ],
    ])('rejects %s', (_n, spec, reason) => {
      expect(rejection(addWire(spec)(base))).toBe(reason)
    })

    it('accepts the input and the output terminal of one pole', () => {
      expect(
        rejection(addAuto(34, pole(id(21), 0, 'input'), pole(id(21), 0, 'output'))(base)),
      ).toBeNull()
    })

    it('rejects the 5001st wire and accepts the 5000th', () => {
      const fill = (n: number): PanelContent => ({
        ...base,
        wires: Array.from({ length: n }, (_, i) => panelWire(10000 + i, cw(id(7)), cw(id(8)))),
      })
      expect(rejection(addAuto(34, cw(id(7)), cw(id(8)))(fill(4999)))).toBeNull()
      expect(rejection(addAuto(34, cw(id(7)), cw(id(8)))(fill(5000)))).toBe('limit')
    })

    it('rejects a wire that would exceed 20000 bends in total', () => {
      const bends = Array.from({ length: 50 }, () => p(1, 1))
      const heavy: PanelContent = {
        ...base,
        wires: Array.from({ length: 400 }, (_, i) =>
          panelWire(10000 + i, cw(id(7)), cw(id(8)), bends),
        ),
      }
      expect(rejection(addAuto(34, cw(id(7)), pole(id(21), 0, 'input'))(heavy))).toBe('limit')
      const room: PanelContent = { ...heavy, wires: heavy.wires.slice(1) } // 399 x 50 = 19950 bends + 2 fit
      expect(rejection(addAuto(34, cw(id(7)), cw(id(8)))(room))).toBeNull()
    })
  })

  describe('removeWire / updateWire', () => {
    it('removes exactly one wire and shares the rest', () => {
      const { content: next } = run(world, removeWire(id(31)))
      expect(next.wires.map((x) => x.id)).toEqual([id(30), id(32), id(33)])
      expect(next.wires[0]).toBe(world.wires[0])
      expect(next.rails).toBe(world.rails)
      expect(rejection(removeWire(id(99))(world))).toBe('notFound')
    })

    it('changes colour and cross-section; an unchanged patch is a no-op', () => {
      const out = run(world, updateWire(id(30), { colour: 'red', crossSection: '6' })).content
      expect(out.wires[0]).toMatchObject({ colour: 'red', crossSection: '6' })
      expect(out.wires[0]?.bends).toBe(world.wires[0]?.bends)
      expect(out.wires[1]).toBe(world.wires[1])
      expect(run(world, updateWire(id(30), { colour: 'brown' })).content).toBe(world)
    })

    it.each([
      ['an unknown colour', { colour: 'pink' as never }, 'invalid'],
      ['a cross-section outside the series', { crossSection: '10' as never }, 'invalid'],
    ])('rejects %s', (_n, patch, reason) =>
      expect(rejection(updateWire(id(30), patch)(world))).toBe(reason),
    )

    it('rejects an unknown wire', () =>
      expect(rejection(updateWire(id(99), { colour: 'red' })(world))).toBe('notFound'))
  })

  describe('bend commands', () => {
    it('moveBend moves a bend and the neighbour that shares its channel', () => {
      const out = run(world, moveBend(id(30), 0, p(350, 900))).content
      expect(bendsOf(out, 30)).toEqual([p(300, 900), p(288, 900)]) // x locked by the cable wire
      expect(out.wires[1]).toBe(world.wires[1])
      expect(out.rails).toBe(world.rails)
      expectOrthogonalRoutes(out)
    })

    it('moveBend to the same place is a no-op', () => {
      expect(run(world, moveBend(id(30), 0, p(300, 1050))).content).toBe(world)
    })

    it('moveBend rejects an unknown wire or bend index', () => {
      expect(rejection(moveBend(id(99), 0, p(1, 1))(world))).toBe('notFound')
      expect(rejection(moveBend(id(30), 5, p(1, 1))(world))).toBe('notFound')
    })

    it('insertBend adds a collinear bend on the chosen segment', () => {
      const out = run(world, insertBend(id(30), 1, p(290, 1100))).content
      expect(bendsOf(out, 30)).toEqual([p(300, 1050), p(290, 1050), p(288, 1050)])
      expectOrthogonalRoutes(out)
    })

    it('insertBend works on a wire without bends', () => {
      const straight = run(
        content({
          inputCables: [inputCable(1, [2, 3])],
          rails: [rail(10, 24, 0, [element(20, 0, 1, 1)])],
        }),
        addAuto(30, cw(id(2)), cw(id(3))),
      ).content
      const out = run(straight, insertBend(id(30), 0, p(350, 450))).content
      expect(out.wires[0]?.bends).toHaveLength((straight.wires[0]?.bends.length ?? 0) + 1)
    })

    it('insertBend is rejected at 50 bends per wire and at 20000 in total', () => {
      const fifty = {
        ...world,
        wires: [
          { ...world.wires[0]!, bends: Array.from({ length: 50 }, (_, i) => p(300, 500 + i)) },
        ],
      }
      expect(rejection(insertBend(id(30), 0, p(300, 510))(fifty))).toBe('limit')
      const heavy = {
        ...world,
        wires: Array.from({ length: 400 }, (_, i) => ({
          ...world.wires[0]!,
          id: id(1000 + i),
          bends: Array.from({ length: 50 }, () => p(300, 600)),
        })),
      }
      const lighter = {
        ...heavy,
        wires: [
          { ...heavy.wires[0]!, bends: heavy.wires[0]!.bends.slice(0, 40) },
          ...heavy.wires.slice(1),
        ],
      }
      expect(rejection(insertBend(heavy.wires[1]!.id, 0, p(300, 510))(heavy))).toBe('limit')
      expect(rejection(insertBend(lighter.wires[0]!.id, 0, p(300, 510))(lighter))).toBeNull()
    })

    it('insertBend rejects an unknown wire or segment', () => {
      expect(rejection(insertBend(id(99), 0, p(1, 1))(world))).toBe('notFound')
      expect(rejection(insertBend(id(30), 9, p(1, 1))(world))).toBe('notFound')
    })

    it('removeBend of a collinear bend keeps the route orthogonal', () => {
      const withExtra = run(world, insertBend(id(30), 1, p(290, 1100))).content
      const out = run(withExtra, removeBend(id(30), 1)).content
      expect(bendsOf(out, 30)).toEqual([p(300, 1050), p(288, 1050)])
      expectOrthogonalRoutes(out)
    })

    it('removeBend never leaves a diagonal wire (falls back to the automatic route when it cannot join)', () => {
      const out = run(world, removeBend(id(30), 0)).content
      expect(isOrthogonal(out)).toBe(true)
    })

    it('removeBend rejects an unknown wire or bend', () => {
      expect(rejection(removeBend(id(99), 0)(world))).toBe('notFound')
      expect(rejection(removeBend(id(30), 7)(world))).toBe('notFound')
    })

    it('resetRoute restores the automatic route after manual edits', () => {
      const edited = run(world, moveBend(id(30), 0, p(300, 900))).content
      expect(bendsOf(edited, 30)).not.toEqual(bendsOf(world, 30))
      const out = run(edited, resetRoute(id(30))).content
      expect(bendsOf(out, 30)).toEqual(bendsOf(world, 30))
    })

    it('resetRoute on an automatic route is a no-op; unknown wire is rejected', () => {
      expect(run(world, resetRoute(id(30))).content).toBe(world)
      expect(rejection(resetRoute(id(99))(world))).toBe('notFound')
    })
  })
})

describe('every command leaves content the backend validator would accept', () => {
  it('after a sequence of structural edits', () => {
    let c = world
    const steps = [
      addRail({ id: id(12), spacingMm: 80 }),
      addElement(id(12), element(50, 1, 2, 4)),
      addBlock(id(12), block(51, 6, 1, 4)),
      moveItem(id(21), id(12), 4),
      updateElement(id(20), { poleCount: 4, widthModules: 2, sidesSwapped: true }),
      updateBlock(id(40), { terminalCount: 2 }),
      addAuto(60, term(id(51), 0), pole(id(50), 3, 'output')),
      moveItem(id(40), id(12), 9),
      removeCableWire(id(3)),
      updateRail(id(10), { spacingMm: 200 }),
    ]
    for (const step of steps) {
      c = run(c, step).content
      expect(validateContent(c)).toEqual([])
      expectOrthogonalRoutes(c)
    }
  })
})
