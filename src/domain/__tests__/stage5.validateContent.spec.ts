/**
 * Stage 5 validation: panel rail width, cable labels, rail/row fit and busbar rules. Property paths
 * and messages are the backend's (backend/src/Panel/PanelContentValidator.php) word for word.
 */
import { describe, expect, it } from 'vitest'
import type { PanelContent } from '../panelContent'
import { resolveViolationItem, validateContent } from '../validateContent'
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
  outputCable,
  panelWire,
  pole,
  rail,
  rowBlock,
} from './helpers'

const dev = (n: number, offset: number, over = {}) => element(n, offset, 1, 2, over)
const pairs = (c: PanelContent) => validateContent(c).map((v) => [v.propertyPath, v.message])
const base = (busbars = [busbar(60, 'LN', id(20), 2)], extra: Partial<PanelContent> = {}) =>
  content({
    rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 1), dev(22, 3)], [], busbars)],
    ...extra,
  })

describe('railWidthModules', () => {
  it.each([1, 24, 60])('accepts %i', (w) => {
    expect(validateContent(content({ railWidthModules: w }))).toEqual([])
  })
  it.each([0, 61, 1.5, -1])('rejects %s with the backend message', (w) => {
    expect(pairs(content({ railWidthModules: w }))).toEqual([
      ['content.railWidthModules', 'Must be between 1 and 60.'],
    ])
  })
  it('is validated before everything else', () => {
    const c = content({ railWidthModules: 0 })
    c.inputCables[0]!.voltage = 0
    expect(validateContent(c)[0]?.propertyPath).toBe('content.railWidthModules')
  })
})

describe('cable label (<= 16 code points)', () => {
  it('accepts 16 characters and 16 emoji (code points, not UTF-16 units)', () => {
    const c = content({ outputCables: [outputCable(4, [5])] })
    c.inputCables[0]!.label = 'x'.repeat(16)
    c.outputCables[0]!.label = '😀'.repeat(16)
    expect(validateContent(c)).toEqual([])
  })
  it('rejects 17 characters on an input and an output cable with id and message', () => {
    const c = content({ outputCables: [outputCable(4, [5])] })
    c.inputCables[0]!.label = 'x'.repeat(17)
    c.outputCables[0]!.label = '😀'.repeat(17)
    expect(validateContent(c)).toEqual([
      {
        propertyPath: 'content.inputCables[0].label',
        code: 'value.too_long',
        parameters: { max: 16 },
        message: 'Must be at most 16 characters long.',
        id: id(1),
      },
      {
        propertyPath: 'content.outputCables[0].label',
        code: 'value.too_long',
        parameters: { max: 16 },
        message: 'Must be at most 16 characters long.',
        id: id(4),
      },
    ])
  })
})

describe('fit within the panel rail width and the terminal row', () => {
  it('rejects a rail item that does not fit the panel rail width', () => {
    const c = content({
      railWidthModules: 10,
      rails: [rail(10, 10, 150, [element(20, 9, 2, 2)], [block(40, 11, 1, 2)])],
    })
    expect(pairs(c)).toEqual([
      ['content.rails[0].elements[0].offsetModules', 'Does not fit within the rail width.'],
      ['content.rails[0].terminalBlocks[0].offsetModules', 'Does not fit within the rail width.'],
    ])
  })
  it('accepts an item ending exactly at the rail width', () => {
    const c = content({ railWidthModules: 10, rails: [rail(10, 10, 150, [element(20, 8, 2, 2)])] })
    expect(validateContent(c)).toEqual([])
  })
  it('skips the fit check for an item with an invalid width (only the width is reported)', () => {
    const c = content({ rails: [rail(10, 24, 150, [element(20, 23, 0, 1)])] })
    expect(pairs(c)).toEqual([['content.rails[0].elements[0].widthModules', 'Must be at least 1.']])
  })
  it('skips the fit check when the rail width itself is invalid', () => {
    const c = content({ railWidthModules: 0, rails: [rail(10, 24, 150, [element(20, 50, 2, 2)])] })
    expect(pairs(c)).toEqual([['content.railWidthModules', 'Must be between 1 and 60.']])
  })
  it.each([
    ['top', 'terminalRow'],
    ['bottom', 'bottomTerminalRow'],
  ] as const)(
    'rejects a %s row block beyond the rail width (the cables do not matter)',
    (name, key) => {
      // rail 24 -> capacity 24, whatever the input cables are
      expect(validateContent(content({ [key]: [rowBlock(50, 23, 2)] }))).toEqual([])
      const bad = content({ [key]: [rowBlock(50, 24, 2)] })
      expect(pairs(bad)).toEqual([
        [
          `content.${key}[0].offsetModules`,
          `Does not fit within the ${name} terminal row (rail width).`,
        ],
      ])
    },
  )
  it.each([
    ['top', 'terminalRow'],
    ['bottom', 'bottomTerminalRow'],
  ] as const)('still checks the %s row fit while the input cables are invalid', (_n, key) => {
    const c = content({ [key]: [rowBlock(50, 30, 2)] })
    c.inputCables = []
    expect(pairs(c).map(([path]) => path)).toEqual([
      'content.inputCables',
      `content.${key}[0].offsetModules`,
    ])
  })
})

describe('busbars: valid content', () => {
  it('accepts a busbar and wires on its feeds', () => {
    const c = base(undefined, {
      wires: [
        panelWire(30, cw(id(2)), feed(id(60), 0)),
        panelWire(31, cw(id(2)), feed(id(60), 1)),
        panelWire(32, feed(id(60), 0), pole(id(20), 0, 'input')), // a feed to a covered input
      ],
    })
    expect(validateContent(c)).toEqual([])
  })
})

describe('busbars: rules with the backend paths and messages', () => {
  it.each<[string, ReturnType<typeof busbar>[], string, string]>([
    ['count 1', [busbar(60, 'L', id(20), 1)], 'count', 'Must be between 2 and 60.'],
    ['count 61', [busbar(60, 'L', id(20), 61)], 'count', 'Must be between 2 and 60.'],
    [
      'anchor on no rail',
      [busbar(60, 'L', id(99), 2)],
      'firstElementId',
      'Must refer to a device on the same rail.',
    ],
    [
      'count beyond the rail items',
      [busbar(60, 'L', id(22), 2)],
      'count',
      'Fewer than 2 consecutive devices from the anchor to the rail end.',
    ],
    [
      'a gap',
      [busbar(60, 'L', id(21), 2)],
      'count',
      'The covered devices must be adjacent (no free modules between them).',
    ],
  ])('%s', (_n, busbars, field, message) => {
    expect(pairs(base(busbars))).toEqual([[`content.rails[0].busbars[0].${field}`, message]])
  })

  it('an ATS or a terminal block in the way', () => {
    const withAts = content({
      rails: [rail(10, 24, 150, [dev(20, 0), ats(21, 1, 2)], [], [busbar(60, 'L', id(20), 2)])],
    })
    const withBlock = content({
      rails: [rail(10, 24, 150, [dev(20, 0)], [block(40, 1, 1, 2)], [busbar(60, 'L', id(20), 2)])],
    })
    const message =
      'The covered items must all be devices (an ATS or a terminal block is in the way).'
    expect(pairs(withAts)).toEqual([['content.rails[0].busbars[0].count', message]])
    expect(pairs(withBlock)).toEqual([['content.rails[0].busbars[0].count', message]])
  })

  it('an ATS anchor', () => {
    const c = content({
      rails: [rail(10, 24, 150, [ats(20, 0, 2), dev(21, 2)], [], [busbar(60, 'L', id(20), 2)])],
    })
    expect(pairs(c)).toEqual([
      ['content.rails[0].busbars[0].firstElementId', 'Must refer to a device, not an ATS.'],
    ])
  })

  it('an anchor on another rail is not on the same rail', () => {
    const c = content({
      rails: [
        rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(30), 2)]),
        rail(11, 24, 150, [dev(30, 0)]),
      ],
    })
    expect(pairs(c)).toEqual([
      ['content.rails[0].busbars[0].firstElementId', 'Must refer to a device on the same rail.'],
    ])
  })

  it('mixed sidesSwapped is reported on the busbar path itself', () => {
    const c = content({
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), dev(21, 1, { sidesSwapped: true })],
          [],
          [busbar(60, 'L', id(20), 2)],
        ),
      ],
    })
    expect(pairs(c)).toEqual([
      ['content.rails[0].busbars[0]', 'All covered devices must have the same sidesSwapped.'],
    ])
  })

  it('a device covered by two busbars is reported on the later one', () => {
    const c = base([busbar(60, 'L', id(20), 2), busbar(61, 'L', id(21), 1 + 1)])
    // second busbar anchors at 21 (gap to 22) -> gap AND overlap
    expect(pairs(c)).toContainEqual([
      'content.rails[0].busbars[1].firstElementId',
      'Covers a device that another busbar already covers.',
    ])
  })

  it('carries the busbar id on its violations', () => {
    expect(validateContent(base([busbar(60, 'L', id(20), 1)]))[0]?.id).toBe(id(60))
  })

  it('rejects a duplicate or malformed busbar id', () => {
    const dup = base([{ ...busbar(60, 'L', id(20), 2), id: id(20) }])
    expect(pairs(dup)).toEqual([
      ['content.rails[0].busbars[0].id', 'Duplicate id within the payload.'],
    ])
    const bad = base([{ ...busbar(60, 'L', id(20), 2), id: 'nope' }])
    expect(pairs(bad)).toEqual([
      ['content.rails[0].busbars[0].id', 'Must be a lowercase RFC 4122 UUID.'],
    ])
  })

  it('skips the coverage walk on a rail with overlap / fit / width violations', () => {
    const overlap = content({
      rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 0)], [], [busbar(60, 'L', id(20), 3)])],
    })
    expect(pairs(overlap)).toEqual([
      ['content.rails[0].elements[1].offsetModules', 'Overlaps another item on the rail.'],
    ])
    const outside = content({
      railWidthModules: 2,
      rails: [
        rail(10, 2, 150, [dev(20, 0), dev(21, 1), dev(22, 2)], [], [busbar(60, 'L', id(20), 4)]),
      ],
    })
    expect(pairs(outside)).toEqual([
      ['content.rails[0].elements[2].offsetModules', 'Does not fit within the rail width.'],
    ])
  })

  it('rejects more than 30 busbars per rail with the backend message', () => {
    const many = Array.from({ length: 31 }, (_, i) => busbar(100 + i, 'L', id(20), 2))
    expect(pairs(base(many))).toContainEqual([
      'content.rails[0].busbars',
      'At most 30 busbars per rail are allowed.',
    ])
  })
})

describe('busbars: backend order of the checks', () => {
  it('reports the count range before the anchor problem (backend: intRange first)', () => {
    const c = base([busbar(60, 'L', id(99), 1)])
    expect(pairs(c)).toEqual([
      ['content.rails[0].busbars[0].count', 'Must be between 2 and 60.'],
      ['content.rails[0].busbars[0].firstElementId', 'Must refer to a device on the same rail.'],
    ])
  })

  it('a broken first busbar does not make a later valid busbar clash (backend: covered = longest valid prefix)', () => {
    // A anchors d20 with count 3: d20, d21 adjacent, d22 after a gap -> reason gap, devices [d20, d21].
    // B anchors d22 (+ d23 adjacent) and is valid on its own: only A is reported.
    const c = content({
      rails: [
        rail(
          10,
          24,
          150,
          [dev(20, 0), dev(21, 1), dev(22, 3), dev(23, 4)],
          [],
          [busbar(60, 'L', id(20), 3), busbar(61, 'L', id(22), 2)],
        ),
      ],
    })
    expect(pairs(c)).toEqual([
      [
        'content.rails[0].busbars[0].count',
        'The covered devices must be adjacent (no free modules between them).',
      ],
    ])
  })
})

describe('busbar wire endpoints', () => {
  const wiredTo = (end: ReturnType<typeof feed>, busbars = [busbar(60, 'L', id(20), 2)]) =>
    pairs(base(busbars, { wires: [panelWire(30, cw(id(2)), end)] }))

  it('rejects an unknown busbar', () => {
    expect(wiredTo(feed(id(99), 0))).toEqual([
      ['content.wires[0].end', 'Refers to a busbar that is not part of this content.'],
    ])
  })
  it('rejects feed 1 of an L busbar and feed 2 of an LN busbar', () => {
    expect(wiredTo(feed(id(60), 1))).toEqual([
      ['content.wires[0].end.feedIndex', 'Must be between 0 and 0.'],
    ])
    expect(wiredTo(feed(id(60), 2), [busbar(60, 'LN', id(20), 2)])).toEqual([
      ['content.wires[0].end.feedIndex', 'Must be between 0 and 1.'],
    ])
    expect(wiredTo(feed(id(60), -1), [busbar(60, 'LN', id(20), 2)])).toEqual([
      ['content.wires[0].end.feedIndex', 'Must be between 0 and 1.'],
    ])
  })
  it('knows a busbar even when the busbar itself is invalid', () => {
    expect(wiredTo(feed(id(60), 0), [busbar(60, 'L', id(99), 2)])).toEqual([
      ['content.rails[0].busbars[0].firstElementId', 'Must refer to a device on the same rail.'],
    ])
  })
  it('rejects a wire from a feed to itself', () => {
    const c = base(undefined, { wires: [panelWire(30, feed(id(60), 0), feed(id(60), 0))] })
    expect(pairs(c)).toEqual([['content.wires[0].end', 'The two ends of a wire must differ.']])
  })
  it('accepts a wire between the two feeds of an LN busbar', () => {
    const c = base(undefined, { wires: [panelWire(30, feed(id(60), 0), feed(id(60), 1))] })
    expect(validateContent(c)).toEqual([])
  })
})

describe('busbar tolerance of the client-only type check', () => {
  it('reports an unknown type on the type path', () => {
    const c = base([{ ...busbar(60, 'L', id(20), 2), type: 'N' as never }])
    expect(pairs(c)).toContainEqual(['content.rails[0].busbars[0].type', 'Must be one of L, LN.'])
  })
})

describe('resolveViolationItem for busbars', () => {
  const c = base()
  it('resolves a busbar path to the busbar, the list to the rail', () => {
    expect(resolveViolationItem(c, 'content.rails[0].busbars[0].count')).toEqual({
      kind: 'busbar',
      id: id(60),
    })
    expect(resolveViolationItem(c, 'content.rails[0].busbars[0]')).toEqual({
      kind: 'busbar',
      id: id(60),
    })
    expect(resolveViolationItem(c, 'content.rails[0].busbars')).toEqual({
      kind: 'rail',
      id: id(10),
    })
  })
  it('falls back to the rail for a busbar that is gone', () => {
    expect(resolveViolationItem(c, 'content.rails[0].busbars[5].count')).toEqual({
      kind: 'rail',
      id: id(10),
    })
  })
})

// keep imports used by the table builders above
void inputCable

describe('terminal row / rail block messages equal the backend', () => {
  it.each([
    ['top', 'terminalRow'],
    ['bottom', 'bottomTerminalRow'],
  ] as const)('too many %s row blocks', (name, key) => {
    const c = content({
      railWidthModules: 60,
      [key]: Array.from({ length: 61 }, (_, i) => rowBlock(100 + i, i, 1)),
    })
    expect(pairs(c)).toContainEqual([
      `content.${key}`,
      `At most 60 terminal blocks are allowed in the ${name} terminal row.`,
    ])
  })
  it('a row block with the wrong width', () => {
    const c = content({ terminalRow: [{ ...rowBlock(50, 0, 4), widthModules: 1 }] })
    expect(pairs(c)).toEqual([
      [
        'content.terminalRow[0].widthModules',
        'Must be 2 (half of the terminal count, rounded up).',
      ],
    ])
  })
  it.each([
    ['top', 'terminalRow'],
    ['bottom', 'bottomTerminalRow'],
  ] as const)('overlapping %s row blocks', (name, key) => {
    const c = content({ [key]: [rowBlock(50, 0, 4), rowBlock(51, 1, 2)] })
    expect(pairs(c)).toEqual([
      [`content.${key}[1].offsetModules`, `Overlaps another block in the ${name} terminal row.`],
    ])
  })

  it('blocks at the same place of different rows do not overlap', () => {
    const c = content({
      terminalRow: [rowBlock(50, 0, 4)],
      bottomTerminalRow: [rowBlock(51, 0, 4)],
    })
    expect(validateContent(c)).toEqual([])
  })

  it('a block id used by both rows is reported (ids are unique across the panel)', () => {
    const c = content({
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(50, 5, 2)],
    })
    expect(pairs(c).map(([path]) => path)).toContain('content.bottomTerminalRow[0].id')
  })

  it('a bottom-row block with the wrong width', () => {
    const c = content({ bottomTerminalRow: [{ ...rowBlock(50, 0, 4), widthModules: 1 }] })
    expect(pairs(c)).toEqual([
      [
        'content.bottomTerminalRow[0].widthModules',
        'Must be 2 (half of the terminal count, rounded up).',
      ],
    ])
  })

  it.each(['inputCableSide', 'outputCableSide'] as const)('rejects an unknown %s', (field) => {
    const c = { ...content(), [field]: 'diagonal' } as unknown as PanelContent
    expect(pairs(c).map(([path]) => path)).toEqual([`content.${field}`])
  })

  it.each(['top', 'bottom', 'left', 'right'] as const)(
    'accepts the side %s for both kinds',
    (side) => {
      expect(validateContent(content({ inputCableSide: side, outputCableSide: side }))).toEqual([])
    },
  )
  it('a rail block wider than one module', () => {
    const c = content({ rails: [rail(10, 24, 150, [], [block(40, 0, 2, 2)])] })
    expect(pairs(c)).toEqual([
      [
        'content.rails[0].terminalBlocks[0].widthModules',
        'A terminal block on a rail is exactly 1 module wide.',
      ],
    ])
  })
})

describe('resolveViolationItem for terminal rows', () => {
  const c = content({
    terminalRow: [rowBlock(50, 0, 2)],
    bottomTerminalRow: [rowBlock(51, 0, 2), rowBlock(52, 3, 2)],
  })

  it.each([
    ['content.terminalRow[0].offsetModules', id(50)],
    ['content.bottomTerminalRow[0].offsetModules', id(51)],
    ['content.bottomTerminalRow[1].widthModules', id(52)],
  ])('%s resolves to its block', (path, blockId) => {
    expect(resolveViolationItem(c, path)).toEqual({ kind: 'block', id: blockId })
  })

  it.each([
    'content.bottomTerminalRow[5].offsetModules',
    'content.terminalRow[1].offsetModules',
    'content.bottomTerminalRow',
  ])('%s resolves to nothing', (path) => {
    expect(resolveViolationItem(c, path)).toBeNull()
  })
})
