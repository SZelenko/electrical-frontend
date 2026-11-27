import { describe, expect, it } from 'vitest'
import { resolveViolationItem, validateContent } from '../validateContent'
import type { PanelContent } from '../panelContent'
import {
  block,
  buildWorld,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  panelWire,
  pole,
  rail,
  term,
} from './helpers'

const paths = (c: PanelContent) => validateContent(c).map((v) => v.propertyPath)

/** A fresh deep copy of the valid world to mutate. */
function w(): PanelContent {
  return structuredClone(buildWorld())
}

describe('validateContent: accepted content', () => {
  it('accepts the valid world', () => expect(validateContent(buildWorld())).toEqual([]))

  it('accepts a minimal panel (one input cable with one wire, nothing else)', () => {
    expect(validateContent(content())).toEqual([])
  })

  it('accepts the exact upper limits', () => {
    const c = content({
      inputCables: Array.from({ length: 20 }, (_, i) =>
        inputCable(100 + i, [200 + i * 4, 201 + i * 4, 202 + i * 4, 203 + i * 4]),
      ),
      outputCables: Array.from({ length: 100 }, (_, i) => outputCable(400 + i, [600 + i])),
      rails: Array.from({ length: 8 }, (_, i) =>
        rail(
          10 + i,
          60,
          99999.9,
          [element(1000 + i, 0, 60, 240, { label: '😀'.repeat(16), marking: '😀'.repeat(6) })],
          [],
        ),
      ),
    })
    expect(validateContent(c)).toEqual([])
  })

  it('accepts bends on the grid edges 0 and 999999', () => {
    const c = w()
    c.wires[0]!.bends = [
      { x: 0, y: 0 },
      { x: 999999, y: 999999 },
    ]
    expect(validateContent(c)).toEqual([])
  })
})

describe('validateContent: collection caps', () => {
  it.each([
    [
      'no input cable',
      (c: PanelContent) => ({ ...c, inputCables: [], wires: [] }),
      ['content.inputCables'],
    ],
    [
      '21 input cables',
      (c: PanelContent) => ({
        ...c,
        inputCables: Array.from({ length: 21 }, (_, i) => inputCable(100 + i, [200 + i])),
        wires: [],
      }),
      ['content.inputCables'],
    ],
    [
      '101 output cables',
      (c: PanelContent) => ({
        ...c,
        outputCables: Array.from({ length: 101 }, (_, i) => outputCable(400 + i, [600 + i])),
        wires: [],
      }),
      ['content.outputCables'],
    ],
    [
      '9 rails',
      (c: PanelContent) => ({
        ...c,
        rails: Array.from({ length: 9 }, (_, i) => rail(10 + i)),
        wires: [],
      }),
      ['content.rails'],
    ],
    [
      '5001 wires',
      (c: PanelContent) => ({
        ...c,
        wires: Array.from({ length: 5001 }, (_, i) => panelWire(10000 + i, cw(id(2)), cw(id(3)))),
      }),
      ['content.wires'],
    ],
    [
      '20050 bends in total (401 wires x 50)',
      (c: PanelContent) => ({
        ...c,
        wires: Array.from({ length: 401 }, (_, i) =>
          panelWire(
            10000 + i,
            cw(id(2)),
            cw(id(3)),
            Array.from({ length: 50 }, () => ({ x: 1, y: 1 })),
          ),
        ),
      }),
      ['content.wires'],
    ],
  ])('rejects %s', (_n, mutate, expected) => {
    expect(paths(mutate(w()))).toEqual(expected)
  })

  it('accepts exactly 5000 wires and exactly 20000 bends', () => {
    const base = w()
    expect(
      validateContent({
        ...base,
        wires: Array.from({ length: 5000 }, (_, i) => panelWire(10000 + i, cw(id(2)), cw(id(3)))),
      }),
    ).toEqual([])
    expect(
      validateContent({
        ...base,
        wires: Array.from({ length: 400 }, (_, i) =>
          panelWire(
            10000 + i,
            cw(id(2)),
            cw(id(3)),
            Array.from({ length: 50 }, () => ({ x: 1, y: 1 })),
          ),
        ),
      }),
    ).toEqual([])
  })
})

describe('validateContent: cables', () => {
  it.each([
    [
      'input cable with 0 wires',
      (c: PanelContent) => {
        c.inputCables[0]!.wires = []
        c.wires = []
      },
      ['content.inputCables[0].wires'],
    ],
    [
      'input cable with 5 wires',
      (c: PanelContent) => {
        c.inputCables[0]!.wires.push(
          ...[7, 8, 9].map((n) => ({ id: id(n), colour: 'red' as const })),
        )
      },
      ['content.inputCables[0].wires'],
    ],
    [
      'output cable with 0 wires',
      (c: PanelContent) => {
        c.outputCables[0]!.wires = []
        c.wires = c.wires.filter((x) => x.id !== id(32))
      },
      ['content.outputCables[0].wires'],
    ],
    [
      'output cable with 5 wires',
      (c: PanelContent) => {
        c.outputCables[0]!.wires.push(
          ...[7, 8, 9, 12].map((n) => ({ id: id(n), colour: 'red' as const })),
        )
      },
      ['content.outputCables[0].wires'],
    ],
    [
      'voltage 0',
      (c: PanelContent) => {
        c.inputCables[0]!.voltage = 0
      },
      ['content.inputCables[0].voltage'],
    ],
    [
      'voltage 230.55 (scale 1)',
      (c: PanelContent) => {
        c.inputCables[0]!.voltage = 230.55
      },
      ['content.inputCables[0].voltage'],
    ],
    [
      'voltage 100000',
      (c: PanelContent) => {
        c.inputCables[0]!.voltage = 100000
      },
      ['content.inputCables[0].voltage'],
    ],
    [
      'frequency 50.123 (scale 2)',
      (c: PanelContent) => {
        c.inputCables[0]!.frequency = 50.123
      },
      ['content.inputCables[0].frequency'],
    ],
    [
      'frequency 1000',
      (c: PanelContent) => {
        c.inputCables[0]!.frequency = 1000
      },
      ['content.inputCables[0].frequency'],
    ],
    [
      'cross-section 0',
      (c: PanelContent) => {
        c.inputCables[0]!.crossSection = 0
      },
      ['content.inputCables[0].crossSection'],
    ],
    [
      'cross-section 1.234',
      (c: PanelContent) => {
        c.inputCables[0]!.crossSection = 1.234
      },
      ['content.inputCables[0].crossSection'],
    ],
    [
      'description of 256 characters',
      (c: PanelContent) => {
        c.outputCables[0]!.description = 'x'.repeat(256)
      },
      ['content.outputCables[0].description'],
    ],
    [
      'description of 256 emoji',
      (c: PanelContent) => {
        c.outputCables[0]!.description = '😀'.repeat(256)
      },
      ['content.outputCables[0].description'],
    ],
  ])('rejects %s', (_n, mutate, expected) => {
    const c = w()
    mutate(c)
    expect(paths(c)).toEqual(expected)
  })

  it.each([
    [
      'frequency 0 (inclusive minimum)',
      (c: PanelContent) => {
        c.inputCables[0]!.frequency = 0
      },
    ],
    [
      'frequency 999.99',
      (c: PanelContent) => {
        c.inputCables[0]!.frequency = 999.99
      },
    ],
    [
      'voltage 99999.9',
      (c: PanelContent) => {
        c.inputCables[0]!.voltage = 99999.9
      },
    ],
    [
      'description of 255 emoji (510 UTF-16 units)',
      (c: PanelContent) => {
        c.outputCables[0]!.description = '😀'.repeat(255)
      },
    ],
    [
      '4 wires in a cable',
      (c: PanelContent) => {
        c.inputCables[0]!.wires.push(...[7, 8].map((n) => ({ id: id(n), colour: 'red' as const })))
      },
    ],
  ])('accepts %s', (_n, mutate) => {
    const c = w()
    mutate(c)
    expect(validateContent(c)).toEqual([])
  })

  it('carries the offending item id on field violations', () => {
    const c = w()
    c.inputCables[0]!.voltage = 0
    expect(validateContent(c)).toEqual([
      { propertyPath: 'content.inputCables[0].voltage', message: expect.any(String), id: id(1) },
    ])
  })
})

describe('validateContent: rails and devices', () => {
  it.each([
    [
      'rail width 0',
      (c: PanelContent) => {
        c.railWidthModules = 0
      },
      ['content.railWidthModules'],
    ],
    [
      'rail width 61',
      (c: PanelContent) => {
        c.railWidthModules = 61
      },
      ['content.railWidthModules'],
    ],
    [
      'rail width 1.5',
      (c: PanelContent) => {
        c.railWidthModules = 1.5
      },
      ['content.railWidthModules'],
    ],
    [
      'spacing 150.55',
      (c: PanelContent) => {
        c.rails[0]!.spacingMm = 150.55
      },
      ['content.rails[0].spacingMm'],
    ],
    [
      'spacing -1',
      (c: PanelContent) => {
        c.rails[0]!.spacingMm = -1
      },
      ['content.rails[0].spacingMm'],
    ],
    [
      'spacing 100000',
      (c: PanelContent) => {
        c.rails[0]!.spacingMm = 100000
      },
      ['content.rails[0].spacingMm'],
    ],
    [
      'label of 17 characters',
      (c: PanelContent) => {
        c.rails[0]!.elements[0]!.label = 'x'.repeat(17)
      },
      ['content.rails[0].elements[0].label'],
    ],
    [
      'label of 17 emoji',
      (c: PanelContent) => {
        c.rails[0]!.elements[1]!.label = '😀'.repeat(17)
      },
      ['content.rails[0].elements[1].label'],
    ],
    [
      'marking of 7 characters',
      (c: PanelContent) => {
        c.rails[0]!.elements[0]!.marking = 'x'.repeat(7)
      },
      ['content.rails[0].elements[0].marking'],
    ],
    [
      '0 poles',
      (c: PanelContent) => {
        c.rails[0]!.elements[0]!.poles = []
        c.wires = []
      },
      ['content.rails[0].elements[0].poles'],
    ],
    [
      '9 poles on 2 modules',
      (c: PanelContent) => {
        c.rails[0]!.elements[0]!.poles = Array.from({ length: 9 }, () => ({ transit: false }))
      },
      ['content.rails[0].elements[0].poles'],
    ],
    [
      '5 poles on 1 module',
      (c: PanelContent) => {
        c.rails[0]!.elements[1]!.poles = Array.from({ length: 5 }, () => ({ transit: false }))
      },
      ['content.rails[0].elements[1].poles'],
    ],
    [
      '0 terminals',
      (c: PanelContent) => {
        c.rails[1]!.terminalBlocks[0]!.terminalCount = 0
        c.wires = []
      },
      ['content.rails[1].terminalBlocks[0].terminalCount'],
    ],
    [
      '13 contacts on a rail block',
      (c: PanelContent) => {
        c.rails[1]!.terminalBlocks[0]!.terminalCount = 13
        c.wires = []
      },
      ['content.rails[1].terminalBlocks[0].terminalCount'],
    ],
    [
      'a rail block 2 modules wide',
      (c: PanelContent) => {
        c.rails[0]!.terminalBlocks[0]!.widthModules = 2
      },
      ['content.rails[0].terminalBlocks[0].widthModules'],
    ],
    [
      'negative offset',
      (c: PanelContent) => {
        c.rails[0]!.elements[0]!.offsetModules = -1
      },
      ['content.rails[0].elements[0].offsetModules'],
    ],
    [
      'element width 0',
      (c: PanelContent) => {
        c.rails[0]!.elements[1]!.widthModules = 0
      },
      ['content.rails[0].elements[1].widthModules'],
    ],
    [
      'block width 0',
      (c: PanelContent) => {
        c.rails[1]!.terminalBlocks[0]!.widthModules = 0
      },
      ['content.rails[1].terminalBlocks[0].widthModules'],
    ],
    [
      'element past the rail end',
      (c: PanelContent) => {
        c.rails[0]!.elements[1]!.offsetModules = 24
      },
      ['content.rails[0].elements[1].offsetModules'],
    ],
    [
      'element overlapping the previous one',
      (c: PanelContent) => {
        c.rails[0]!.elements[1]!.offsetModules = 1
      },
      ['content.rails[0].elements[1].offsetModules'],
    ],
    [
      'block overlapping an element',
      (c: PanelContent) => {
        c.rails[0]!.terminalBlocks[0]!.offsetModules = 4
      },
      ['content.rails[0].terminalBlocks[0].offsetModules'],
    ],
  ])('rejects %s', (_n, mutate, expected) => {
    const c = w()
    mutate(c)
    expect(paths(c)).toEqual(expected)
  })

  it('does not report a fit violation when the rail width itself is invalid', () => {
    const c = content({ rails: [rail(10, 61, 150, [element(20, 59, 4, 2)])] })
    // the rail width is a panel value now: only it is reported, the rail items are not checked against it
    expect(paths(c)).toEqual(['content.railWidthModules'])
  })

  it('flags the later item of an overlapping pair (sorted by offset, then end)', () => {
    const c = content({ rails: [rail(10, 24, 150, [element(20, 0, 2)], [block(40, 1, 1, 2)])] })
    expect(paths(c)).toEqual(['content.rails[0].terminalBlocks[0].offsetModules'])
    const d = content({ rails: [rail(10, 24, 150, [element(20, 1, 2)], [block(40, 1, 1, 2)])] })
    expect(paths(d)).toEqual(['content.rails[0].elements[0].offsetModules'])
  })

  it('flags every item swallowed by a wide earlier item', () => {
    const c = content({
      rails: [
        rail(10, 24, 150, [element(20, 0, 8, 2), element(21, 2, 1, 1), element(22, 4, 1, 1)]),
      ],
    })
    expect(paths(c)).toEqual([
      'content.rails[0].elements[1].offsetModules',
      'content.rails[0].elements[2].offsetModules',
    ])
  })

  it('accepts adjacent items and items filling the rail exactly', () => {
    const c = content({ rails: [rail(10, 4, 150, [element(20, 0, 2), element(21, 2, 2)])] })
    expect(validateContent(c)).toEqual([])
  })

  it('accepts the poles/terminals density limits (4 per module / 2 per module)', () => {
    const c = content({ rails: [rail(10, 24, 150, [element(20, 0, 1, 4)], [block(40, 2, 1, 2)])] })
    expect(validateContent(c)).toEqual([])
  })
})

describe('validateContent: wires', () => {
  const withWire = (
    start: ReturnType<typeof cw>,
    end: ReturnType<typeof cw>,
    bends: { x: number; y: number }[] = [],
  ) => {
    const c = w()
    c.wires = [panelWire(30, start, end, bends)]
    return c
  }

  it.each([
    ['unknown element on start', pole(id(99), 0), cw(id(2)), ['content.wires[0].start']],
    ['pole index past the count', cw(id(2)), pole(id(20), 2), ['content.wires[0].end.poleIndex']],
    ['negative pole index', pole(id(20), -1), cw(id(2)), ['content.wires[0].start.poleIndex']],
    ['unknown terminal block on end', cw(id(2)), term(id(99), 0), ['content.wires[0].end']],
    [
      'terminal index past the count',
      cw(id(2)),
      term(id(41), 2),
      ['content.wires[0].end.terminalIndex'],
    ],
    ['unknown cable wire', cw(id(99)), cw(id(2)), ['content.wires[0].start']],
    [
      'both endpoints unknown',
      cw(id(98)),
      cw(id(99)),
      ['content.wires[0].start', 'content.wires[0].end'],
    ],
    // same-terminal wires are reported on the end (never on start)
    ['same cable wire', cw(id(2)), cw(id(2)), ['content.wires[0].end']],
    [
      'same pole terminal',
      pole(id(20), 0, 'input'),
      pole(id(20), 0, 'input'),
      ['content.wires[0].end'],
    ],
    ['same block terminal', term(id(40), 1), term(id(40), 1), ['content.wires[0].end']],
  ])('rejects %s', (_n, start, end, expected) => {
    expect(paths(withWire(start, end))).toEqual(expected)
  })

  it('accepts the input and output terminal of one pole (different nodes)', () => {
    expect(validateContent(withWire(pole(id(20), 0, 'input'), pole(id(20), 0, 'output')))).toEqual(
      [],
    )
  })

  it('does not add the same-terminal violation when an endpoint is already invalid', () => {
    expect(paths(withWire(cw(id(99)), cw(id(99))))).toEqual([
      'content.wires[0].start',
      'content.wires[0].end',
    ])
  })

  it('reports the index of the offending wire, not the first one', () => {
    const c = w()
    c.wires[2]!.end = c.wires[2]!.start
    expect(paths(c)).toEqual(['content.wires[2].end'])
  })

  it.each([
    [
      'more than 50 bends',
      Array.from({ length: 51 }, () => ({ x: 1, y: 1 })),
      ['content.wires[0].bends'],
    ],
    ['negative x', [{ x: -1, y: 5 }], ['content.wires[0].bends[0].x']],
    ['x above 99999.9 mm', [{ x: 1000000, y: 5 }], ['content.wires[0].bends[0].x']],
    ['y above 99999.9 mm', [{ x: 5, y: 1000000 }], ['content.wires[0].bends[0].y']],
    [
      'fractional tenths (more than 1 decimal in mm)',
      [{ x: 1.5, y: 5 }],
      ['content.wires[0].bends[0].x'],
    ],
    [
      'both coordinates bad on the second bend',
      [
        { x: 1, y: 1 },
        { x: -1, y: 0.5 },
      ],
      ['content.wires[0].bends[1].x', 'content.wires[0].bends[1].y'],
    ],
  ])('rejects %s', (_n, bends, expected) => {
    expect(paths(withWire(cw(id(2)), cw(id(3)), bends))).toEqual(expected)
  })

  it('accepts exactly 50 bends', () => {
    expect(
      validateContent(
        withWire(
          cw(id(2)),
          cw(id(3)),
          Array.from({ length: 50 }, () => ({ x: 1, y: 1 })),
        ),
      ),
    ).toEqual([])
  })
})

describe('validateContent: ids', () => {
  it.each([
    [
      'rail id',
      (c: PanelContent) => {
        c.rails[0]!.id = 'rail-1'
      },
      ['content.rails[0].id'],
    ],
    [
      'element id',
      (c: PanelContent) => {
        c.rails[0]!.elements[0]!.id = 'x'
      },
      ['content.rails[0].elements[0].id'],
    ],
    [
      'cable wire id',
      (c: PanelContent) => {
        c.inputCables[0]!.wires[1]!.id = ''
      },
      ['content.inputCables[0].wires[1].id'],
    ],
    [
      'wire id',
      (c: PanelContent) => {
        c.wires[1]!.id = 'nope'
      },
      ['content.wires[1].id'],
    ],
  ])('rejects an invalid UUID as %s', (_name, mutate, expected) => {
    const c = w()
    mutate(c)
    expect(paths(c)).toEqual(expect.arrayContaining(expected)) // dependants may add unresolved-endpoint paths
  })

  it('rejects an uppercase UUID', () => {
    const c = w()
    c.rails[0]!.id = 'ABCDEF00-0000-4000-8000-000000000010'
    expect(paths(c)).toEqual(['content.rails[0].id'])
  })

  it('reports an invalid UUID without an item id', () => {
    const c = w()
    c.rails[0]!.id = 'x'
    expect(validateContent(c)[0]).toEqual({
      propertyPath: 'content.rails[0].id',
      message: expect.any(String),
      id: null,
    })
  })

  it('reports duplicates on the later item (cables, rails, devices, wires share one id space)', () => {
    const c = w()
    c.rails[1]!.id = id(20) // same as element E1 on the earlier rail... claimed first by rails order
    expect(paths(c)).toContain('content.rails[1].id')
    const d = w()
    d.wires[0]!.id = id(2) // an input cable wire id
    expect(paths(d)).toEqual(['content.wires[0].id'])
    const e = w()
    e.outputCables[0]!.id = id(1)
    expect(paths(e)).toEqual(['content.outputCables[0].id'])
  })

  it('carries the duplicated id on a duplicate violation', () => {
    const d = w()
    d.wires[0]!.id = id(2)
    expect(validateContent(d)[0]?.id).toBe(id(2))
  })
})

describe('validateContent: output', () => {
  it('collects several violations in validation order (rail width, cables, rails, wires)', () => {
    const c = w()
    c.inputCables[0]!.voltage = 0
    c.railWidthModules = 0
    c.wires[0]!.end = c.wires[0]!.start
    expect(paths(c)).toEqual([
      'content.railWidthModules',
      'content.inputCables[0].voltage',
      'content.wires[0].end',
    ])
  })

  it('caps the list at 200 violations like the backend', () => {
    const bad = (n: number) => ({
      ...inputCable(100 + n, [200 + n]),
      voltage: 0,
      frequency: -1,
      crossSection: 0,
    })
    const c = content({ inputCables: Array.from({ length: 20 }, (_, i) => bad(i)) })
    expect(validateContent(c)).toHaveLength(60)
    const many = {
      ...c,
      wires: Array.from({ length: 300 }, (_, i) => panelWire(5000 + i, cw(id(99)), cw(id(98)))),
    }
    expect(validateContent(many)).toHaveLength(200)
  })
})

describe('resolveViolationItem (E9: nearest ancestor with an id)', () => {
  const world = buildWorld()
  it.each([
    ['content.rails[1]', { kind: 'rail', id: id(11) }],
    ['content.rails[0].elements[1].poles', { kind: 'element', id: id(21) }],
    ['content.rails[0].elements[0].label', { kind: 'element', id: id(20) }],
    ['content.rails[0].terminalBlocks[0].terminalCount', { kind: 'block', id: id(40) }],
    ['content.inputCables[0].voltage', { kind: 'inputCable', id: id(1) }],
    ['content.inputCables[0].wires[1].id', { kind: 'cableWire', id: id(3) }],
    ['content.inputCables[0].wires', { kind: 'inputCable', id: id(1) }],
    ['content.outputCables[0].description', { kind: 'outputCable', id: id(4) }],
    ['content.outputCables[0].wires[0]', { kind: 'cableWire', id: id(5) }],
    ['content.wires[3].end.terminalIndex', { kind: 'wire', id: id(33) }],
    ['content.wires[0].bends[0].x', { kind: 'wire', id: id(30) }],
    ['content.rails[0].elements[9].label', { kind: 'rail', id: id(10) }], // element gone: nearest existing ancestor
  ])('%s -> %j', (path, expected) => {
    expect(resolveViolationItem(world, path)).toEqual(expected)
  })

  it.each([
    ['content.wires'],
    ['content.railWidthModules'], // a panel value, no item
    ['content.rails'],
    ['content.inputCables'],
    ['content.rails[9].widthModules'],
    ['content.wires[99].end'],
    ['something.else[0]'],
    [''],
  ])('%s has no item', (path) => {
    expect(resolveViolationItem(world, path)).toBeNull()
  })
})
