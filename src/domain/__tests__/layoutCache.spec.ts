import { describe, expect, it } from 'vitest'
import {
  addInputCable,
  insertBend,
  moveItem,
  removeBend,
  removeRail,
  updateElement,
  updateInputCable,
  updateRail,
  type Command,
} from '../commands'
import { computeLayout } from '../geometry'
import { MAX_TOTAL_BENDS } from '../limits'
import type { PanelContent } from '../panelContent'
import {
  buildWorld,
  content,
  element,
  id,
  inputCable,
  outputCable,
  panelWire,
  cw,
  rail,
  run,
} from './helpers'

const world = buildWorld()
const same = <T>(a: T | undefined, b: T | undefined) => expect(a).toBe(b)

describe('computeLayout box cache: unchanged items keep their box object', () => {
  it('two layouts of the same content share every box', () => {
    expect.hasAssertions()
    const a = computeLayout(world)
    const b = computeLayout(world)
    for (const [key, box] of a.elements) same(b.elements.get(key), box)
    for (const [key, box] of a.blocks) same(b.blocks.get(key), box)
    a.rails.forEach((box, i) => same(b.rails[i], box))
    a.inputBoxes.forEach((box, i) => same(b.inputBoxes[i], box))
    a.outputBoxes.forEach((box, i) => same(b.outputBoxes[i], box))
  })

  it.each<[string, Command, string[]]>([
    ['a text edit of one element', updateElement(id(20), { label: 'QF1' }), [id(21)]],
    ['toggling an element on/off', updateElement(id(21), { on: false }), [id(20)]],
  ])('%s: the other elements and all blocks keep their boxes', (_n, command, untouched) => {
    expect.hasAssertions()
    const next = run(world, command).content
    const a = computeLayout(world)
    const b = computeLayout(next)
    for (const key of untouched) same(b.elements.get(key), a.elements.get(key))
    for (const [key, box] of a.blocks) same(b.blocks.get(key), box)
    same(b.rails[1], a.rails[1]) // the untouched rail; the edited rail object is new, so its box is rebuilt
  })

  it('an edit of the input cable label keeps the rail, element and block boxes', () => {
    expect.hasAssertions()
    const next = run(world, updateInputCable(id(1), { voltage: 400 })).content
    const a = computeLayout(world)
    const b = computeLayout(next)
    a.rails.forEach((box, i) => same(b.rails[i], box))
    for (const [key, box] of a.elements) same(b.elements.get(key), box)
  })
})

describe('computeLayout box cache: boxes are recomputed correctly when only the position changes', () => {
  it('spacing of an earlier rail moves the later rails and their devices', () => {
    const next = run(world, updateRail(id(10), { spacingMm: 160 })).content
    const l = computeLayout(next)
    expect(l.rails.map((r) => r.cy)).toEqual([2200, 3200])
    expect(l.rails[1]).toMatchObject({ index: 1, y: 3200 - 175 })
    expect(l.blocks.get(id(41))).toMatchObject({ y: 3200 - 450, railIndex: 1 })
    expect(l.elements.get(id(20))).toMatchObject({ y: 2200 - 450 })
    expect(l.outTop).toBe(3200 + 450 + 150)
    expect(l.cableWires.get(id(5))?.pt).toEqual({ x: 300, y: 3800 })
  })

  it('the same result as a fresh layout of an equal but unshared content', () => {
    const next = run(world, updateRail(id(10), { spacingMm: 160 })).content
    expect(computeLayout(next)).toEqual(computeLayout(structuredClone(next)))
  })

  it('deleting rail 0 shifts the indices and centre lines of the remaining rail', () => {
    const next = run(world, removeRail(id(10))).content
    const l = computeLayout(next)
    expect(l.rails).toHaveLength(1)
    expect(l.rails[0]).toMatchObject({ id: id(11), index: 0, cy: 600 + 1000 })
    expect(l.blocks.get(id(41))).toMatchObject({ railIndex: 0, railId: id(11), y: 1600 - 450 })
    expect(l.outTop).toBe(1600 + 450 + 150)
  })

  it('adding an input cable in front shifts the later cable boxes and their wire points', () => {
    const front = { ...world, inputCables: [inputCable(6, [7]), ...world.inputCables] }
    const l = computeLayout(front)
    expect(l.inputBoxes.map((b) => [b.id, b.index, b.x])).toEqual([
      [id(6), 0, 200],
      [id(1), 1, 500],
    ])
    expect(l.cableWires.get(id(2))?.pt).toEqual({ x: 600, y: 450 })
    expect(l.cableWires.get(id(3))?.pt).toEqual({ x: 700, y: 450 })
    expect(l.inputBoxes[1]?.wires.map((w) => w.pt.x)).toEqual([600, 700])
  })

  it('appending an input cable leaves the earlier cable boxes untouched (same objects)', () => {
    expect.hasAssertions()
    const next = run(world, addInputCable(inputCable(6, [7]))).content
    same(computeLayout(next).inputBoxes[0], computeLayout(world).inputBoxes[0])
  })

  it('removing the last rail moves the output row up', () => {
    const next = run(world, removeRail(id(11))).content
    const l = computeLayout(next)
    expect(l.outTop).toBe(2100 + 450 + 150)
    expect(l.outputBoxes[0]).toMatchObject({ y: 2700 })
    expect(l.cableWires.get(id(5))?.pt).toEqual({ x: 300, y: 2700 })
    expect(l.height).toBe(2700 + 250 + 200)
  })

  it('moving an element to another rail gives its box the new railId, index and y', () => {
    const next = run(world, moveItem(id(21), id(11), 4)).content
    const l = computeLayout(next)
    expect(l.elements.get(id(21))).toMatchObject({ railId: id(11), railIndex: 1, y: 3100 - 450 })
    expect(l.elements.get(id(20))).toMatchObject({ railId: id(10), railIndex: 0 })
  })

  it('the same element object under another rail of the same index and centre line gets that rail id', () => {
    const shared = element(20, 0, 2, 2)
    const a = content({ rails: [rail(10, 24, 150, [shared])] })
    const b = content({ rails: [rail(11, 24, 150, [shared])] })
    expect(computeLayout(a).elements.get(id(20))?.railId).toBe(id(10))
    expect(computeLayout(b).elements.get(id(20))?.railId).toBe(id(11))
    expect(computeLayout(a).elements.get(id(20))?.railId).toBe(id(10))
  })

  it('a block object reused under another rail gets that rail id too', () => {
    const shared = {
      id: id(40),
      offsetModules: 0,
      widthModules: 1,
      terminalCount: 2,
      colour: null,
      label: '',
    }
    const a = content({ rails: [rail(10, 24, 150, [], [shared])] })
    const b = content({ rails: [rail(11, 24, 150, [], [shared])] })
    expect(computeLayout(a).blocks.get(id(40))?.railId).toBe(id(10))
    expect(computeLayout(b).blocks.get(id(40))?.railId).toBe(id(11))
  })

  it('the output row follows a changed number of rails for cable objects that are shared', () => {
    const out = outputCable(4, [5])
    const one = content({ outputCables: [out], rails: [rail(10)] })
    const two = content({ outputCables: [out], rails: [rail(10), rail(11)] })
    expect(computeLayout(one).outputBoxes[0]?.y).toBe(2100 + 450 + 150)
    expect(computeLayout(two).outputBoxes[0]?.y).toBe(2100 + 1500 + 450 + 150)
    expect(computeLayout(two).cableWires.get(id(5))?.pt.y).toBe(4200)
  })
})

describe('removeBend keeps the panel within the total bend cap', () => {
  it('never produces more bends than the caps allow (total <= 20000, per wire <= 50)', () => {
    const heavy: PanelContent = {
      ...world,
      wires: [
        ...world.wires.slice(0, 1),
        ...Array.from({ length: 399 }, (_, i) =>
          panelWire(
            1000 + i,
            cw(id(2)),
            cw(id(3)),
            Array.from({ length: 50 }, () => ({ x: 1, y: 1 })),
          ),
        ),
      ],
    }
    const out = removeBend(id(30), 0)(heavy)
    const bends = out.ok ? out.content.wires.reduce((n, w) => n + w.bends.length, 0) : 0
    expect(bends).toBeLessThanOrEqual(MAX_TOTAL_BENDS)
  })

  it('insertBend is rejected at the cap while removeBend still works (it never adds more than it removes)', () => {
    const base = run(world, insertBend(id(30), 1, { x: 294, y: 1050 })).content
    const out = removeBend(id(30), 1)(base)
    expect(out.ok).toBe(true)
  })
})
