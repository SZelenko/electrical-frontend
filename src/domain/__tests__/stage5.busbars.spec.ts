/** Stage 5: busbar covered-set walk, geometry of the busbar body and feeds, issues. Success + Error. */
import { describe, expect, it } from 'vitest'
import {
  busbarCover,
  busbarCovering,
  busbarIssues,
  coveredDevices,
  invalidBusbarIds,
  issuesOfBusbar,
  maxBusbarCount,
  railItems,
} from '../busbars'
import { BUSBAR_H, computeLayout, endpointDirection, endpointPoint, rowCapacity } from '../geometry'
import {
  ats,
  block,
  busbar,
  content,
  element,
  feed,
  id,
  inputCable,
  rail,
  rowBlock,
} from './helpers'

const dev = (n: number, offset: number, over = {}) => element(n, offset, 1, 2, over)

/** d20 [0,1) d21 [1,2) d22 [2,3) | gap | d23 [4,5) a24 [5,7) b40 [7,8) d25 [8,9). */
const mixed = () =>
  rail(
    10,
    24,
    150,
    [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 4), ats(24, 5, 2), dev(25, 8)],
    [block(40, 7, 1, 2)],
  )

describe('railItems', () => {
  it('merges elements and blocks in offset order', () => {
    expect(railItems(mixed()).map((i) => i.id)).toEqual(
      [20, 21, 22, 23, 24, 40, 25].map((n) => id(n)),
    )
  })
})

describe('busbarCover: the covered-set walk', () => {
  const r = mixed()
  const cover = (anchor: number, count: number) =>
    busbarCover(r, busbar(60, 'L', id(anchor), count))

  it('covers the anchor and the next count - 1 items in offset order', () => {
    const c = cover(20, 3)!
    expect(c.items.map((i) => i.id)).toEqual([id(20), id(21), id(22)])
    expect(c.issue).toBeNull()
  })

  it('walks in offset order even when the elements array is not sorted', () => {
    const shuffled = rail(10, 24, 150, [dev(22, 2), dev(20, 0), dev(21, 1)])
    const c = busbarCover(shuffled, busbar(60, 'L', id(20), 3))!
    expect(c.items.map((i) => i.id)).toEqual([id(20), id(21), id(22)])
    expect(c.issue).toBeNull()
  })

  it('a gap between covered devices is reported', () => {
    expect(cover(20, 4)!.issue).toBe('gap')
  })

  it('an ATS in the way is reported as notDevice', () => {
    expect(cover(23, 2)!.issue).toBe('notDevice')
  })

  it('a terminal block in the way is reported as notDevice', () => {
    const r2 = rail(10, 24, 150, [dev(20, 0), dev(22, 2)], [block(40, 1, 1, 2)])
    expect(busbarCover(r2, busbar(60, 'L', id(20), 3))!.issue).toBe('notDevice')
  })

  it('a count beyond the items of the rail is tooFew and the items are clamped', () => {
    const c = cover(25, 5)!
    expect(c.issue).toBe('tooFew')
    expect(c.items.map((i) => i.id)).toEqual([id(25)])
  })

  it('devices with different sidesSwapped are reported as mixedSwap', () => {
    const r2 = rail(10, 24, 150, [dev(20, 0), dev(21, 1, { sidesSwapped: true })])
    expect(busbarCover(r2, busbar(60, 'L', id(20), 2))!.issue).toBe('mixedSwap')
  })

  it('the first problem wins: a gap is reported before mixed sides', () => {
    const r2 = rail(10, 24, 150, [dev(20, 0), dev(21, 3, { sidesSwapped: true })])
    expect(busbarCover(r2, busbar(60, 'L', id(20), 2))!.issue).toBe('gap')
  })

  it('returns null when the anchor is not an element of the rail', () => {
    expect(cover(99, 2)).toBeNull()
    expect(cover(40, 2)).toBeNull() // a terminal block is not an anchor
  })

  it('coveredDevices skips ATS and blocks', () => {
    const c = busbarCover(
      rail(10, 24, 150, [dev(20, 0), ats(24, 1, 2), dev(21, 3)]),
      busbar(60, 'L', id(20), 3),
    )!
    expect(coveredDevices(c).map((d) => d.id)).toEqual([id(20), id(21)])
  })
})

describe('maxBusbarCount', () => {
  it('counts the adjacent free devices from the anchor', () => {
    expect(maxBusbarCount(mixed(), id(20))).toBe(3)
    expect(maxBusbarCount(mixed(), id(21))).toBe(2)
  })

  it('is 1 for a lone device, 0 for an ATS, a block or an unknown id', () => {
    expect(maxBusbarCount(mixed(), id(25))).toBe(1)
    expect(maxBusbarCount(mixed(), id(24))).toBe(0)
    expect(maxBusbarCount(mixed(), id(40))).toBe(0)
    expect(maxBusbarCount(mixed(), id(99))).toBe(0)
  })

  it('stops at a device with another sidesSwapped', () => {
    const r = rail(10, 24, 150, [dev(20, 0), dev(21, 1), dev(22, 2, { sidesSwapped: true })])
    expect(maxBusbarCount(r, id(20))).toBe(2)
  })

  it('stops at devices covered by another busbar and is 0 for a covered anchor', () => {
    const r = rail(
      10,
      24,
      150,
      [dev(20, 0), dev(21, 1), dev(22, 2), dev(23, 3)],
      [],
      [busbar(60, 'L', id(22), 2)],
    )
    expect(maxBusbarCount(r, id(20))).toBe(2)
    expect(maxBusbarCount(r, id(22))).toBe(0)
    expect(maxBusbarCount(r, id(22), id(60))).toBe(2) // the busbar itself is ignored
  })

  it('is capped at 60', () => {
    const many = rail(
      10,
      60,
      150,
      Array.from({ length: 60 }, (_, i) => dev(100 + i, i)),
    )
    expect(maxBusbarCount(many, id(100))).toBe(60)
  })
})

describe('busbarCovering', () => {
  const r = rail(
    10,
    24,
    150,
    [dev(20, 0), dev(21, 1), dev(22, 2)],
    [],
    [busbar(60, 'L', id(20), 2)],
  )
  it('finds the busbar covering a device', () => {
    expect(busbarCovering(r, id(21))?.busbar.id).toBe(id(60))
    expect(busbarCovering(r, id(20))?.busbar.id).toBe(id(60))
  })
  it('is null for an uncovered device', () => expect(busbarCovering(r, id(22))).toBeNull())
})

describe('busbarIssues / invalidBusbarIds / issuesOfBusbar', () => {
  const check = (r: ReturnType<typeof rail>, b = r.busbars[0]!) =>
    busbarIssues(r, b, railItems(r), new Set()).map((i) => [i.field, i.kind, i.message])

  it('a valid busbar has no issues', () => {
    const r = rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'LN', id(20), 2)])
    expect(check(r)).toEqual([])
    expect(invalidBusbarIds(content({ rails: [r] })).size).toBe(0)
  })

  it.each([
    [
      'anchor missing',
      busbar(60, 'L', id(99), 2),
      [['firstElementId', 'anchorMissing', 'Must refer to a device on the same rail.']],
    ],
    [
      'anchor is an ATS',
      busbar(60, 'L', id(24), 2),
      [['firstElementId', 'anchorAts', 'Must refer to a device, not an ATS.']],
    ],
    ['count 1', busbar(60, 'L', id(20), 1), [['count', 'count', 'Must be between 2 and 60.']]],
    ['count 61', busbar(60, 'L', id(20), 61), [['count', 'count', 'Must be between 2 and 60.']]],
    [
      'too few',
      busbar(60, 'L', id(25), 3),
      [['count', 'tooFew', 'Fewer than 3 consecutive devices from the anchor to the rail end.']],
    ],
    [
      'foreign item',
      busbar(60, 'L', id(23), 2),
      [
        [
          'count',
          'notDevice',
          'The covered items must all be devices (an ATS or a terminal block is in the way).',
        ],
      ],
    ],
    [
      'gap',
      busbar(60, 'L', id(20), 4),
      [['count', 'gap', 'The covered devices must be adjacent (no free modules between them).']],
    ],
  ])('%s', (_n, b, expected) => {
    const r = rail(10, 24, 150, mixed().elements, mixed().terminalBlocks, [b])
    expect(check(r)).toEqual(expected)
  })

  it('mixed sides is reported on the busbar itself', () => {
    const r = rail(
      10,
      24,
      150,
      [dev(20, 0), dev(21, 1, { sidesSwapped: true })],
      [],
      [busbar(60, 'L', id(20), 2)],
    )
    expect(check(r)).toEqual([
      ['busbar', 'mixedSwap', 'All covered devices must have the same sidesSwapped.'],
    ])
  })

  it('a device covered twice is reported on the later busbar only', () => {
    const r = rail(
      10,
      24,
      150,
      [dev(20, 0), dev(21, 1), dev(22, 2)],
      [],
      [busbar(60, 'L', id(20), 2), busbar(61, 'L', id(21), 2)],
    )
    expect(issuesOfBusbar(r, id(60))).toEqual([])
    expect(issuesOfBusbar(r, id(61)).map((i) => i.message)).toEqual([
      'Covers a device that another busbar already covers.',
    ])
    expect([...invalidBusbarIds(content({ rails: [r] }))]).toEqual([id(61)])
  })

  it('issuesOfBusbar is empty for an unknown busbar', () => {
    expect(issuesOfBusbar(mixed(), id(99))).toEqual([])
  })
})

describe('geometry of the busbar body and feeds', () => {
  // railsTop 850 + 150 mm -> cy 2350; element top edge 1900, bottom 2800
  const c = content({
    rails: [
      rail(10, 24, 150, [dev(20, 2), dev(21, 3), dev(22, 4)], [], [busbar(60, 'LN', id(20), 3)]),
    ],
  })
  const box = computeLayout(c).busbars.get(id(60))!

  it('lies outside the devices against the input (top) edge, from the anchor to the last device', () => {
    expect(box).toMatchObject({ x: 200 + 2 * 175, y: 1900 - BUSBAR_H, h: BUSBAR_H, swapped: false })
    expect(box.w).toBe(3 * 175)
    expect(BUSBAR_H).toBe(60)
  })

  it('feed L at anchorX + 30 and feed N at anchorX + 90 on the outer edge, leaving upwards', () => {
    expect(endpointPoint(computeLayout(c), feed(id(60), 0))).toEqual({ x: 550 + 30, y: 1840 })
    expect(endpointPoint(computeLayout(c), feed(id(60), 1))).toEqual({ x: 550 + 90, y: 1840 })
    expect(endpointDirection(computeLayout(c), feed(id(60), 0))).toBe('up')
  })

  it('an L busbar has only feed 0; feed 1 and an unknown busbar are unknown points', () => {
    const l = content({
      rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(20), 2)])],
    })
    const layout = computeLayout(l)
    expect(endpointPoint(layout, feed(id(60), 1))).toBeNull()
    expect(endpointDirection(layout, feed(id(60), 1))).toBeNull()
    expect(endpointPoint(layout, feed(id(99), 0))).toBeNull()
    expect(endpointDirection(layout, feed(id(99), 0))).toBeNull()
  })

  it('sidesSwapped anchors put the body below the bottom edge and the feeds leave downwards', () => {
    const s = content({
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0, { sidesSwapped: true }), dev(21, 1, { sidesSwapped: true })],
          [],
          [busbar(60, 'LN', id(20), 2)],
        ),
      ],
    })
    const layout = computeLayout(s)
    expect(layout.busbars.get(id(60))).toMatchObject({ y: 2800, h: 60, swapped: true, dir: 'down' })
    expect(endpointPoint(layout, feed(id(60), 0))).toEqual({ x: 230, y: 2860 })
    expect(endpointDirection(layout, feed(id(60), 0))).toBe('down')
  })

  it('an invalid busbar is clamped to the items that exist; a missing anchor gives no box', () => {
    const clamped = content({
      rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(20), 9)])],
    })
    expect(computeLayout(clamped).busbars.get(id(60))?.w).toBe(2 * 175)
    const none = content({
      rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(99), 2)])],
    })
    expect(computeLayout(none).busbars.size).toBe(0)
  })

  it('follows a moved device (the box is not cached by the busbar object)', () => {
    const r = rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(20), 2)])
    const a = computeLayout(content({ rails: [r] })).busbars.get(id(60))!
    const moved = {
      ...r,
      elements: [{ ...r.elements[0]!, offsetModules: 5 }, ...r.elements.slice(1)],
    }
    const b = computeLayout(content({ rails: [moved] })).busbars.get(id(60))!
    expect(b.x).toBe(a.x + 5 * 175)
  })
})

describe('row geometry (the terminal rows do not depend on the input cables)', () => {
  it.each([[[1]], [[2]], [[4]], [[1, 1]], [[4, 4]], [[]]])(
    'input cables with %j wires leave the rows at the rail start and the full rail width',
    (wires) => {
      const cables = wires.map((n, i) => ({
        ...content().inputCables[0]!,
        id: id(100 + i),
        wires: Array.from({ length: n }, (_, k) => ({
          id: id(200 + 10 * i + k),
          colour: 'brown' as const,
        })),
      }))
      const layout = computeLayout(
        content({
          inputCables: cables,
          railWidthModules: 24,
          terminalRow: [rowBlock(80, 0, 2)],
          bottomTerminalRow: [rowBlock(81, 0, 2)],
        }),
      )
      expect(layout.railsLeft).toBe(200)
      expect(layout.blocks.get(id(80))?.x).toBe(200)
      expect(layout.blocks.get(id(81))?.x).toBe(200)
      expect(layout.railWidthModules).toBe(24)
    },
  )
})

describe('rowCapacity', () => {
  it.each([[60], [24], [1]])('is the rail width (%i modules)', (width) => {
    expect(rowCapacity({ railWidthModules: width })).toBe(width)
  })

  it('equals the layout value, whatever the cables', () => {
    const c = content({
      inputCables: Array.from({ length: 5 }, (_, i) => inputCable(100 + i, [200 + i, 300 + i])),
      outputCableSide: 'left',
      railWidthModules: 30,
    })
    expect(rowCapacity(c)).toBe(30)
    expect(rowCapacity(c)).toBe(computeLayout(c).railWidthModules)
  })

  it('no input cables take no space either', () => {
    expect(rowCapacity(content({ inputCables: [], railWidthModules: 24 }))).toBe(24)
  })
})
