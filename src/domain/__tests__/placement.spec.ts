import { describe, expect, it } from 'vitest'
import { computeLayout } from '../geometry'
import {
  checkElementWidth,
  checkPlacement,
  checkRailWidth,
  checkRowPlacement,
  firstFreeOffset,
  nearestFreeOffset,
  railAtY,
  railSpans,
  rightmostEnd,
  snapOffset,
} from '../placement'
import { block, buildWorld, content, element, id, rail, rowBlock } from './helpers'

/** 12 modules; E1 [0,2), E2 [4,7), block [8,10). Free: 2-3, 7, 10-11. */
const r12 = rail(10, 12, 150, [element(20, 0, 2, 2), element(21, 4, 3, 2)], [block(40, 8, 2, 2)])

describe('railSpans / rightmostEnd', () => {
  it('lists elements then blocks with offset and width', () => {
    expect(railSpans(r12)).toEqual([
      { id: id(20), offset: 0, width: 2 },
      { id: id(21), offset: 4, width: 3 },
      { id: id(40), offset: 8, width: 2 },
    ])
  })
  it('rightmost end is the largest offset + width, 0 for an empty rail', () => {
    expect(rightmostEnd(r12)).toBe(10)
    expect(rightmostEnd(rail(1, 12))).toBe(0)
  })
})

describe('checkPlacement', () => {
  it.each([
    ['fits in a free gap', null, 2, 2, null],
    ['touches the neighbour without overlapping', null, 2, 2, null],
    ['fills a single free module', null, 7, 1, null],
    ['fits at the rail end', null, 10, 2, null],
    ['moving an item onto its own slot ignores itself', id(20), 1, 2, null],
    ['rejects overlap with the next element', null, 2, 3, 'overlap'],
    ['rejects overlap with a block', null, 9, 1, 'overlap'],
    ['rejects overlap with the left neighbour', null, 1, 1, 'overlap'],
    ['rejects an item swallowing an element', null, 3, 6, 'overlap'],
    ['rejects an item past the rail end', null, 11, 2, 'outOfRail'],
    ['rejects an item exactly one module too wide', null, 10, 3, 'outOfRail'],
    ['rejects a negative offset', null, -1, 1, 'negativeOffset'],
    ['rejects width 0', null, 2, 0, 'invalidSize'],
    ['rejects a fractional width', null, 2, 1.5, 'invalidSize'],
    ['rejects a fractional offset', null, 1.5, 1, 'invalidSize'],
    ['rejects NaN', null, Number.NaN, 1, 'invalidSize'],
    ['an item cannot grow over another even when ignoring itself', id(20), 0, 5, 'overlap'],
  ])('%s', (_n, ignore, offset, width, expected) => {
    expect(checkPlacement(r12, 12, ignore, offset, width)).toBe(expected)
  })

  it('reports invalidSize before negativeOffset before outOfRail', () => {
    expect(checkPlacement(r12, 12, null, -5, 0)).toBe('invalidSize')
    expect(checkPlacement(r12, 12, null, -1, 20)).toBe('negativeOffset')
  })
})

describe('snapOffset (drawing x in tenths of mm -> module offset)', () => {
  it.each([
    [200, 0],
    [287, 0], // 87/175 = 0.497
    [288, 1], // 88/175 = 0.503
    [375, 1],
    [1075, 5],
    [10700, 60],
    [100, -1], // not clamped
    [0, -1],
  ])('x=%i -> %i', (x, offset) => expect(snapOffset(x) + 0).toBe(offset))
})

describe('nearestFreeOffset / firstFreeOffset', () => {
  it.each([
    ['exact free spot', 2, 1, 2],
    ['tie between two spots takes the left one', 5, 1, 3],
    ['nearest to the right', 6, 1, 7],
    ['inside the free tail', 11, 1, 11],
    ['wanted past the rail end clamps to the last free spot', 40, 1, 11],
    ['wanted negative clamps to the first free spot', -7, 1, 2],
    ['two modules wide: only 2 and 10 fit', 7, 2, 10],
  ])('%s', (_n, wanted, width, expected) => {
    expect(nearestFreeOffset(r12, 12, null, wanted, width)).toBe(expected)
  })

  it('returns null when nothing of that width fits', () => {
    expect(nearestFreeOffset(r12, 12, null, 0, 3)).toBeNull()
    expect(nearestFreeOffset(r12, 12, null, 0, 13)).toBeNull()
  })

  it('ignores the moving item itself', () => {
    expect(nearestFreeOffset(r12, 12, id(21), 8, 3)).toBe(5)
  })

  it('first free offset from the left', () => {
    expect(firstFreeOffset(r12, 12, 1)).toBe(2)
    expect(firstFreeOffset(r12, 12, 2)).toBe(2)
    expect(firstFreeOffset(r12, 12, 3)).toBeNull()
    expect(firstFreeOffset(rail(1, 12), 12, 12)).toBe(0)
    expect(firstFreeOffset(rail(1, 12), 12, 13)).toBeNull()
  })
})

describe('railAtY (rail band = element height around the centre line)', () => {
  const layout = computeLayout(buildWorld()) // centres 2100 and 3100 (railsTop 600)
  it.each([
    [2100, 0],
    [1650, 0], // inclusive top edge
    [2550, 0], // inclusive bottom edge
    [3100, 1],
    [2650, 1],
    [3550, 1],
    [1649, null],
    [2551, null], // gap between the rails
    [2649, null],
    [3551, null],
    [0, null],
  ])('y=%i -> %s', (y, expected) => expect(railAtY(layout, y)).toBe(expected))

  it('is null on a panel without rails', () => {
    expect(railAtY(computeLayout(content()), 1100)).toBeNull()
  })
})

describe('checkElementWidth', () => {
  const e1 = r12.elements[0]! // offset 0, width 2, 2 poles
  it.each([
    ['same width', 2, undefined, null],
    ['shrink to 1 module (2 poles fit)', 1, undefined, null],
    ['grow into the free gap', 3, undefined, null],
    ['grow to touch the neighbour', 4, undefined, null],
    ['grow into the neighbour', 5, undefined, 'overlap'],
    ['grow past the rail', 13, undefined, 'outOfRail'],
    ['width 0', 0, undefined, 'invalidSize'],
    ['fractional width', 1.5, undefined, 'invalidSize'],
    ['4 poles on 1 module', 1, 4, null],
    ['5 poles on 1 module', 1, 5, 'tooNarrowForPoles'],
    ['8 poles on 2 modules', 2, 8, null],
    ['9 poles on 2 modules', 2, 9, 'tooNarrowForPoles'],
  ])('%s', (_n, width, poles, expected) => {
    expect(checkElementWidth(r12, 12, e1, width, poles)).toBe(expected)
  })
})

describe('checkRowPlacement (terminal row: capacity in modules, no overlap)', () => {
  const row = [rowBlock(40, 8, 3), rowBlock(41, 20, 2)] // [8,10) and [20,21)
  it.each([
    ['a free slot', null, 0, 2, null],
    ['touching a neighbour', null, 10, 10, null],
    ['up to the row end', null, 58, 2, null],
    ['past the row end', null, 59, 2, 'outOfRow'],
    ['overlapping a block', null, 9, 2, 'overlap'],
    ['the block itself grows within free space', id(40), 8, 6, null],
    ['the block itself grows into a neighbour', id(40), 8, 13, 'overlap'],
    ['a negative offset', null, -1, 1, 'negativeOffset'],
    ['width 0', null, 0, 0, 'invalidSize'],
  ])('%s', (_n, ignore, offset, width, expected) => {
    expect(checkRowPlacement(row, 60, ignore, offset, width)).toBe(expected)
  })
})

describe('checkRailWidth', () => {
  it.each([
    ['exactly the rightmost end', 10, null],
    ['wider', 11, null],
    ['60 modules', 60, null],
    ['one module under the rightmost end', 9, 'railTooNarrow'],
    ['0', 0, 'invalidSize'],
    ['61', 61, 'invalidSize'],
    ['fractional', 10.5, 'invalidSize'],
    ['negative', -3, 'invalidSize'],
  ])('%s', (_n, width, expected) =>
    expect(checkRailWidth(content({ rails: [r12] }), width, 1)).toBe(expected),
  )

  it('an empty rail can shrink to 1 module', () => {
    expect(checkRailWidth(content({ rails: [rail(1, 12)] }), 1, 1)).toBeNull()
  })
})
