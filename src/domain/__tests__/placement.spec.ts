import { describe, expect, it } from 'vitest'
import { computeLayout } from '../geometry'
import {
  checkElementWidth,
  checkPlacement,
  checkRailWidth,
  checkRowPlacement,
  firstFreeOffset,
  inRowBand,
  nearestFreeOffset,
  nearestFreeRowOffset,
  railAtY,
  railSpans,
  rightmostEnd,
  snapOffset,
} from '../placement'
import {
  block,
  buildWorld,
  content,
  element,
  id,
  inputCable,
  outputCable,
  rail,
  rowBlock,
} from './helpers'

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
  const layout = { railsLeft: 200 }
  it.each([
    [200, 0],
    [287, 0], // 87/175 = 0.497
    [288, 1], // 88/175 = 0.503
    [375, 1],
    [1075, 5],
    [10700, 60],
    [100, -1], // not clamped
    [0, -1],
  ])('x=%i -> %i', (x, offset) => expect(snapOffset(layout, x) + 0).toBe(offset))

  it.each([
    [600, 0], // railsLeft 600 (cables on the left): the rail start
    [687, 0],
    [688, 1],
    [200, -2], // x of the default rail start is now left of it
  ])('with railsLeft 600: x=%i -> %i', (x, offset) =>
    expect(snapOffset({ railsLeft: 600 }, x) + 0).toBe(offset),
  )

  it('follows the layout of a panel with input cables on the left', () => {
    const left = computeLayout(content({ inputCableSide: 'left' }))
    expect(left.railsLeft).toBe(600)
    expect(snapOffset(left, left.railsLeft + 3 * 175)).toBe(3)
  })
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
  const layout = computeLayout(buildWorld()) // centres 2500 and 3500 (railsTop 1000)
  it.each([
    [2500, 0],
    [2050, 0], // inclusive top edge
    [2950, 0], // inclusive bottom edge
    [3500, 1],
    [3050, 1],
    [3950, 1],
    [2049, null],
    [2951, null], // gap between the rails
    [3049, null],
    [3951, null],
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
    expect(checkRailWidth(content({ rails: [r12] }), width)).toBe(expected),
  )

  it('an empty rail can shrink to 1 module', () => {
    expect(checkRailWidth(content({ rails: [rail(1, 12)] }), 1)).toBeNull()
  })

  it.each([
    ['top', 'terminalRow'],
    ['bottom', 'bottomTerminalRow'],
  ] as const)('the %s terminal row limits the width by its rightmost end', (_row, key) => {
    const c = content({ [key]: [rowBlock(40, 5, 4)] }) // ends at module 7
    expect(checkRailWidth(c, 7)).toBeNull()
    expect(checkRailWidth(c, 6)).toBe('rowOverflow')
  })

  it('input cables never limit the width (rows start at the rail start)', () => {
    const c = content({ inputCables: [inputCable(1, [2, 3, 4, 5])], railWidthModules: 24 })
    expect(checkRailWidth(c, 1)).toBeNull()
  })

  it('a rail item is reported before a row overflow', () => {
    const c = content({ rails: [r12], terminalRow: [rowBlock(40, 0, 2)] })
    expect(checkRailWidth(c, 9)).toBe('railTooNarrow')
  })
})

describe('inRowBand (both terminal-row bands, inclusive edges)', () => {
  // default panel: topRowY 600 (band 600..850), no rails, bottomRowY 1150 (band 1150..1400)
  const layout = computeLayout(content())
  it.each([
    [599, null],
    [600, 'top'],
    [725, 'top'],
    [850, 'top'],
    [851, null],
    [1149, null],
    [1150, 'bottom'],
    [1400, 'bottom'],
    [1401, null],
    [0, null],
  ] as const)('y=%i -> %s', (y, expected) => expect(inRowBand(layout, y)).toBe(expected))

  it('follows a taller drawing (output cables below the rails)', () => {
    const tall = computeLayout(
      content({
        rails: [rail(10, 24, 150)],
        outputCables: [outputCable(4, [5])],
      }),
    )
    // rail cy 2500 -> sideBottom 2950; outTop 3100; bottomRowY 3500
    expect(inRowBand(tall, 3500)).toBe('bottom')
    expect(inRowBand(tall, 3750)).toBe('bottom')
    expect(inRowBand(tall, 3751)).toBeNull()
    expect(inRowBand(tall, 1150)).toBeNull()
  })
})

describe('nearestFreeRowOffset', () => {
  const row = [rowBlock(40, 2, 2), rowBlock(41, 5, 2)] // [2,3) and [5,6); capacity 8
  it.each([
    ['the wanted offset when free', 0, 1, 0],
    ['a free offset between blocks', 3, 1, 3],
    ['tie takes the left one', 4, 2, 3],
    ['nearest to the right when the left is taken', 5, 1, 4],
    ['clamps into the row', 20, 1, 7],
  ])('%s', (_n, wanted, width, expected) =>
    expect(nearestFreeRowOffset(row, 8, null, wanted, width)).toBe(expected),
  )

  it('ignores the block being moved', () => {
    expect(nearestFreeRowOffset(row, 8, id(40), 2, 1)).toBe(2)
  })

  it('returns null when nothing fits', () => {
    expect(nearestFreeRowOffset([rowBlock(40, 0, 6)], 3, null, 0, 1)).toBeNull()
    expect(nearestFreeRowOffset([], 2, null, 0, 3)).toBeNull()
  })
})
