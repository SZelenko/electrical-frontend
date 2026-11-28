/** Stage 3: ATS, terminal-row blocks, rail blocks with side contacts, copy. Success + Error per behaviour. */
import { describe, expect, it } from 'vitest'
import { t } from '@/i18n'
import { autoRoute } from '../autoRoute'
import {
  addBlock,
  addElement,
  addRowBlock,
  addWire,
  copyItem,
  moveItem,
  moveRowBlock,
  removeBlock,
  removeElement,
  setPoleTransit,
  updateBlock,
  updateElement,
} from '../commands'
import {
  computeLayout,
  endpointDirection,
  endpointPoint,
  railContactY,
  sideFitsBlock,
  wirePolyline,
  type Direction,
  type Pt,
} from '../geometry'
import { checkElementWidth, checkRowPlacement, firstFreeRowOffset, inRowBand } from '../placement'
import { autoRouteFor, finishDrawnRoute } from '../routes'
import {
  atsStateName,
  describeElement,
  describeEndpoint,
  drawingKey,
  endpointKey,
  type AtsState,
  type PanelContent,
  type PanelElement,
} from '../panelContent'
import { validateContent } from '../validateContent'
import { defaultWireColour } from '../wireDefaults'
import {
  addAuto,
  ats,
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  newWire,
  panelWire,
  pole,
  rail,
  rejection,
  rowBlock,
  run,
  term,
} from './helpers'

const p = (x: number, y: number): Pt => ({ x, y })

/** True when every segment of the polyline is horizontal or vertical. */
function orthogonal(points: readonly Pt[]): boolean {
  return points.every((a, i) => {
    const b = points[i + 1]
    return !b || a.x === b.x || a.y === b.y
  })
}
const allOrthogonal = (c: PanelContent) => {
  const l = computeLayout(c)
  return c.wires.every((w) => orthogonal(wirePolyline(l, w) ?? []))
}

/**
 * World: C1 (id2 brown, id3 blue); row block R id50 [0,2) 3 contacts, row block id51 [4,5) 2 contacts;
 * rail 1 id10 (cy 2500): ATS id21 [0,2), device id20 [4,6) 2 poles, rail block id40 [10,11) 3 contacts;
 * rail 2 id11 (cy 3500) empty; the input cable is on top (default), so railsTop is 1000; the row capacity is the rail width, 24.
 */
function world(): PanelContent {
  return content({
    inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
    terminalRow: [rowBlock(50, 0, 3), rowBlock(51, 4, 2)],
    rails: [
      rail(10, 24, 150, [ats(21, 0, 2), element(20, 4, 2, 2)], [block(40, 10, 1, 3)]),
      rail(11, 24, 100),
    ],
  })
}

// ---------------------------------------------------------------- geometry

describe('geometry: rail block contacts (left/right, 38 + 75k)', () => {
  const layout = computeLayout(world())
  // box x = 200 + 10*175 = 1950, y = 2500 - 450 = 2050
  it.each([
    [0, 'left', p(1975, 2088)],
    [0, 'right', p(2100, 2088)],
    [1, 'left', p(1975, 2163)],
    [1, 'right', p(2100, 2163)],
    [2, 'left', p(1975, 2238)],
    [2, 'right', p(2100, 2238)],
  ] as const)('contact %i %s is at the exact integer point', (k, side, expected) => {
    expect(endpointPoint(layout, term(id(40), k, side))).toEqual(expected)
  })

  it('left and right of one contact share y and differ by 125 (one module minus both insets)', () => {
    const l = endpointPoint(layout, term(id(40), 1, 'left'))!
    const r = endpointPoint(layout, term(id(40), 1, 'right'))!
    expect(l.y).toBe(r.y)
    expect(r.x - l.x).toBe(125)
  })

  it('12 contacts fit inside the 450-high box (last at +38+75*11)', () => {
    const c = content({ rails: [rail(10, 24, 150, [], [block(40, 0, 1, 12)])] })
    const l = computeLayout(c)
    const last = endpointPoint(l, term(id(40), 11, 'left'))!
    expect(last.y).toBe(2050 + 38 + 75 * 11)
    expect(last.y).toBeLessThan(2050 + 900)
    expect(railContactY(l.blocks.get(id(40))!, 0)).toBe(2088)
  })

  it('top/bottom sides do not exist on a rail block, left/right do not exist on a row block', () => {
    expect(endpointPoint(layout, term(id(40), 0, 'top'))).toBeNull()
    expect(endpointPoint(layout, term(id(40), 0, 'bottom'))).toBeNull()
    expect(endpointPoint(layout, term(id(50), 0, 'left'))).toBeNull()
    expect(endpointPoint(layout, term(id(50), 0, 'right'))).toBeNull()
    expect(sideFitsBlock(layout.blocks.get(id(40))!, 'left')).toBe(true)
    expect(sideFitsBlock(layout.blocks.get(id(40))!, 'top')).toBe(false)
    expect(sideFitsBlock(layout.blocks.get(id(50))!, 'top')).toBe(true)
    expect(sideFitsBlock(layout.blocks.get(id(50))!, 'right')).toBe(false)
  })

  it('a contact index past the count is unknown', () => {
    expect(endpointPoint(layout, term(id(40), 3, 'left'))).toBeNull()
    expect(endpointPoint(layout, term(id(40), -1, 'left'))).toBeNull()
  })
})

describe('geometry: terminal-row blocks', () => {
  const layout = computeLayout(world())
  it('row block box: y = topRowY 600, height 250, x = railsLeft 200 + offset*175, width = modules*175', () => {
    const b = layout.blocks.get(id(50))!
    expect([b.x, b.y, b.w, b.h, b.railId, b.railIndex, b.row]).toEqual([
      200,
      600,
      350,
      250,
      null,
      null,
      'top',
    ])
    const b2 = layout.blocks.get(id(51))!
    expect([b2.x, b2.w]).toEqual([900, 175])
  })

  it('3 contacts on 2 modules follow the pole formula (783, 900, 1017)', () => {
    // x = 200 + floor((350*(2i+1) + 3) / 6)
    expect([0, 1, 2].map((i) => endpointPoint(layout, term(id(50), i, 'top'))?.x)).toEqual([
      200 + Math.floor((350 * 1 + 3) / 6),
      200 + Math.floor((350 * 3 + 3) / 6),
      200 + Math.floor((350 * 5 + 3) / 6),
    ])
    expect([0, 1, 2].map((i) => endpointPoint(layout, term(id(50), i, 'top'))?.x)).toEqual([
      258, 375, 492,
    ])
  })

  it('top is at y 600 and bottom at y 850, same x', () => {
    const t = endpointPoint(layout, term(id(51), 1, 'top'))!
    const b = endpointPoint(layout, term(id(51), 1, 'bottom'))!
    expect(t.y).toBe(600)
    expect(b.y).toBe(850)
    expect(t.x).toBe(b.x)
  })

  it('railsTop is 1000 (below the top terminal row): the first rail centre line is 1000 + spacing', () => {
    expect(layout.railsTop).toBe(1000)
    expect(layout.rails[0]?.cy).toBe(2500)
  })

  it('the drawing is as wide as the panel rail width (rails or not)', () => {
    expect(computeLayout(content({ railWidthModules: 60 })).width).toBe(2 * 200 + 60 * 175)
    expect(computeLayout(content({ railWidthModules: 10 })).width).toBe(2 * 200 + 10 * 175)
  })

  it('rowCapacity is the rail width and does not depend on the cables', () => {
    expect(computeLayout(world()).railWidthModules).toBe(24)
    expect(computeLayout(content({ railWidthModules: 2 })).railWidthModules).toBe(2)
    expect(computeLayout(content({ railWidthModules: 1 })).railWidthModules).toBe(1)
    const wide = content({
      railWidthModules: 5,
      inputCables: Array.from({ length: 6 }, (_, i) => inputCable(100 + i, [200 + i])),
    })
    expect(computeLayout(wide).railWidthModules).toBe(5)
  })
})

describe('geometry: ATS terminals (4 inputs, 2 outputs)', () => {
  const layout = computeLayout(world())
  // box x 200, w 350, y 2050, h 900
  it.each([
    [0, 244],
    [1, 331],
    [2, 419],
    [3, 506],
  ])('input %i sits at x %i on the top edge', (i, x) => {
    expect(endpointPoint(layout, pole(id(21), i, 'input'))).toEqual(p(x, 2050))
  })
  it.each([
    [0, 288],
    [1, 463],
  ])('output %i sits at x %i on the bottom edge', (i, x) => {
    expect(endpointPoint(layout, pole(id(21), i, 'output'))).toEqual(p(x, 2950))
  })

  it('there is no fifth input and no third output (error)', () => {
    expect(endpointPoint(layout, pole(id(21), 4, 'input'))).toBeNull()
    expect(endpointPoint(layout, pole(id(21), 2, 'output'))).toBeNull()
  })

  it('sidesSwapped puts the inputs at the bottom and the outputs at the top, keeping x', () => {
    const c = run(world(), updateElement(id(21), { sidesSwapped: true })).content
    const l = computeLayout(c)
    expect(endpointPoint(l, pole(id(21), 2, 'input'))).toEqual(p(419, 2950))
    expect(endpointPoint(l, pole(id(21), 1, 'output'))).toEqual(p(463, 2050))
    expect(endpointDirection(l, pole(id(21), 0, 'input'))).toBe('down')
    expect(endpointDirection(l, pole(id(21), 0, 'output'))).toBe('up')
  })

  it('the box height does not depend on the contact count and the kind is ats', () => {
    const b = layout.elements.get(id(21))!
    expect([b.kind, b.h, b.poleCount, b.outputCount]).toEqual(['ats', 900, 4, 2])
    expect(layout.elements.get(id(20))?.kind).toBe('device')
  })

  it('a wider ATS spreads the contacts with the same formula (4 modules: 1/8, 3/8 ...)', () => {
    const c = content({ rails: [rail(10, 24, 150, [ats(21, 0, 4)])] })
    const l = computeLayout(c)
    expect([0, 1, 2, 3].map((i) => endpointPoint(l, pole(id(21), i, 'input'))?.x)).toEqual([
      200 + Math.floor((700 * 1 + 4) / 8),
      200 + Math.floor((700 * 3 + 4) / 8),
      200 + Math.floor((700 * 5 + 4) / 8),
      200 + Math.floor((700 * 7 + 4) / 8),
    ])
  })
})

describe('endpointDirection for side contacts', () => {
  const layout = computeLayout(world())
  it.each([
    [term(id(40), 0, 'left'), 'left'],
    [term(id(40), 2, 'right'), 'right'],
    [term(id(50), 0, 'top'), 'up'],
    [term(id(50), 0, 'bottom'), 'down'],
    [pole(id(21), 0, 'input'), 'up'],
    [pole(id(21), 0, 'output'), 'down'],
  ] as const)('%j leaves %s', (e, dir) => {
    expect(endpointDirection(layout, e)).toBe(dir)
  })
  it('an impossible side has no direction (error)', () => {
    expect(endpointDirection(layout, term(id(40), 0, 'top'))).toBeNull()
    expect(endpointDirection(layout, term(id(50), 0, 'left'))).toBeNull()
    expect(endpointDirection(layout, term(id(99), 0, 'left'))).toBeNull()
  })
})

describe('endpointKey / drawingKey', () => {
  it('the node key ignores the contact side, the drawing key does not', () => {
    expect(endpointKey(term('b', 1, 'top'))).toBe(endpointKey(term('b', 1, 'bottom')))
    expect(drawingKey(term('b', 1, 'top'))).not.toBe(drawingKey(term('b', 1, 'bottom')))
    expect(drawingKey(term('b', 1, 'left'))).toBe('t:b:1:left')
    expect(drawingKey(pole('e', 0, 'input'))).toBe('p:e:0:input')
    expect(drawingKey(cw('w'))).toBe('w:w')
  })
})

// ---------------------------------------------------------------- routing

describe('autoRoute with horizontal ends', () => {
  const first = (start: Pt, bends: Pt[], end: Pt) => [start, ...bends, end]
  const dirOf = (a: Pt, b: Pt): Direction =>
    a.x < b.x ? 'right' : a.x > b.x ? 'left' : a.y < b.y ? 'down' : 'up'
  const opposite: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  }

  it.each([
    ['left to right', p(1975, 2088), 'left', p(1000, 2400), 'right'],
    ['left to up', p(1975, 2088), 'left', p(1000, 1650), 'up'],
    ['right to down', p(2100, 2163), 'right', p(2500, 1650), 'down'],
    ['right to left', p(2100, 2163), 'right', p(2700, 2400), 'left'],
    ['left to left', p(1975, 2088), 'left', p(1500, 2400), 'left'],
    ['up to left', p(300, 450), 'up', p(1000, 2400), 'left'],
    ['down to right', p(300, 450), 'down', p(1000, 2400), 'right'],
  ] as [string, Pt, Direction, Pt, Direction][])(
    '%s: orthogonal, leaves in its direction and arrives against the end direction',
    (_n, start, startDir, end, endDir) => {
      const bends = autoRoute(start, startDir, end, endDir)
      const route = first(start, bends, end)
      expect(orthogonal(route)).toBe(true)
      expect(dirOf(route[0] as Pt, route[1] as Pt)).toBe(startDir)
      const n = route.length
      expect(dirOf(route[n - 2] as Pt, route[n - 1] as Pt)).toBe(opposite[endDir])
      expect(bends.length).toBeLessThanOrEqual(4)
    },
  )

  it('aligned horizontal contacts facing each other need no bends', () => {
    expect(autoRoute(p(2100, 2163), 'right', p(2700, 2163), 'left')).toEqual([])
  })

  it('autoRouteFor a wire from a rail block side contact to a cable wire is orthogonal', () => {
    const l = computeLayout(world())
    const bends = autoRouteFor(l, { start: term(id(40), 1, 'left'), end: cw(id(2)) })!
    expect(orthogonal([endpointPoint(l, term(id(40), 1, 'left'))!, ...bends, p(300, 450)])).toBe(
      true,
    )
  })

  it('autoRouteFor an impossible side is null (error)', () => {
    const l = computeLayout(world())
    expect(autoRouteFor(l, { start: term(id(40), 0, 'top'), end: cw(id(2)) })).toBeNull()
  })
})

describe('finishDrawnRoute with the end direction', () => {
  it.each([
    [
      'vertical end, misaligned: elbow (end.x, last.y)',
      [p(300, 900)],
      p(700, 1650),
      'up',
      [p(300, 900), p(700, 900)],
    ],
    [
      'horizontal end, misaligned: elbow (last.x, end.y)',
      [p(300, 900)],
      p(1975, 2088),
      'left',
      [p(300, 900), p(300, 2088)],
    ],
    [
      'horizontal end, aligned in y: no elbow',
      [p(300, 2088)],
      p(1975, 2088),
      'left',
      [p(300, 2088)],
    ],
    [
      'horizontal end, aligned in x: no elbow',
      [p(1975, 900)],
      p(1975, 2088),
      'right',
      [p(1975, 900)],
    ],
    ['vertical end, aligned in x: no elbow', [p(700, 900)], p(700, 1650), 'down', [p(700, 900)]],
  ] as [string, Pt[], Pt, Direction, Pt[]][])('%s', (_n, bends, end, dir, expected) => {
    expect(finishDrawnRoute(p(300, 450), bends, end, dir)).toEqual(expected)
  })

  it('without clicks the start point decides: misaligned horizontal end gets (start.x, end.y)', () => {
    expect(finishDrawnRoute(p(300, 450), [], p(1975, 2088), 'right')).toEqual([p(300, 2088)])
  })

  it('the default end direction is vertical', () => {
    expect(finishDrawnRoute(p(300, 450), [], p(700, 1650))).toEqual([p(700, 450)])
  })
})

// ---------------------------------------------------------------- placement

describe('placement: ATS width, rail block, row band', () => {
  const r = rail(10, 24, 150, [ats(21, 0, 2), element(20, 4, 2, 2)])
  it.each([
    ['ATS at its minimum width', 21, 2, null],
    ['ATS grown into free space', 21, 4, null],
    ['ATS of width 1', 21, 1, 'tooNarrowForAts'],
    ['ATS of width 0', 21, 0, 'invalidSize'],
    ['ATS grown into the neighbour', 21, 5, 'overlap'],
  ] as const)('%s', (_n, elId, width, expected) => {
    const el = r.elements.find((e) => e.id === id(elId)) as PanelElement
    expect(checkElementWidth(r, 24, el, width)).toBe(expected)
  })

  it('an ATS is not limited by poles (poleCount is irrelevant)', () => {
    expect(checkElementWidth(r, 24, r.elements[0] as PanelElement, 2, 99)).toBeNull()
  })

  it('firstFreeRowOffset finds a gap between blocks and none in a full row', () => {
    expect(firstFreeRowOffset([rowBlock(50, 0, 3)], 60, 1)).toBe(2)
    expect(firstFreeRowOffset([rowBlock(50, 0, 60)], 60, 1)).toBe(30)
    expect(firstFreeRowOffset([rowBlock(50, 0, 120)], 60, 1)).toBeNull()
  })

  it('the top row band is topRowY..topRowY+250 inclusive', () => {
    const l = computeLayout(world())
    expect([599, 600, 850, 851].map((y) => inRowBand(l, y))).toEqual([null, 'top', 'top', null])
  })

  it('checkRowPlacement: fits, overlap, out of the row, negative offset, invalid size', () => {
    const row = [rowBlock(50, 0, 3)]
    expect(checkRowPlacement(row, 60, null, 2, 1)).toBeNull()
    expect(checkRowPlacement(row, 60, null, 1, 1)).toBe('overlap')
    expect(checkRowPlacement(row, 60, null, 59, 2)).toBe('outOfRow')
    expect(checkRowPlacement(row, 60, null, -1, 1)).toBe('negativeOffset')
    expect(checkRowPlacement(row, 60, null, 0.5, 1)).toBe('invalidSize')
    expect(checkRowPlacement(row, 60, id(50), 0, 3)).toBeNull()
  })
})

// ---------------------------------------------------------------- validateContent

describe('validateContent: stage 3 rules (paths as the backend)', () => {
  const paths = (c: PanelContent) => validateContent(c).map((v) => v.propertyPath)
  const edit = (fn: (c: PanelContent) => void): PanelContent => {
    const c = structuredClone(world())
    fn(c)
    return c
  }
  const withWire = (start: ReturnType<typeof term>, end: ReturnType<typeof term>) =>
    edit((c) => {
      c.wires.push(panelWire(30, start, end))
    })

  it('accepts the stage-3 world and wires from every kind of contact', () => {
    expect(validateContent(world())).toEqual([])
    const c = edit((x) => {
      x.wires.push(
        panelWire(30, term(id(50), 0, 'top'), pole(id(21), 3, 'input')),
        panelWire(31, term(id(50), 0, 'bottom'), term(id(40), 2, 'right')),
        panelWire(32, pole(id(21), 1, 'output'), term(id(40), 0, 'left')),
      )
    })
    expect(validateContent(c)).toEqual([])
  })

  it('accepts a 60-contact row block and 12-contact rail block (the upper limits) on a 60-module rail', () => {
    const c = content({
      railWidthModules: 60,
      terminalRow: [rowBlock(50, 0, 60)],
      rails: [rail(10, 60, 150, [], [block(40, 0, 1, 12)])],
    })
    expect(validateContent(c)).toEqual([])
  })

  it('rejects a 60-contact row block when the rail is too narrow for the row (30 modules > rail width 24)', () => {
    const c = content({
      terminalRow: [rowBlock(50, 0, 60)],
      rails: [rail(10, 24, 150, [], [block(40, 0, 1, 12)])],
    })
    expect(validateContent(c).map((v) => v.propertyPath)).toEqual([
      'content.terminalRow[0].offsetModules',
    ])
  })

  it.each([
    [
      'row block with 0 contacts',
      (c: PanelContent) => (c.terminalRow[0]!.terminalCount = 0),
      'content.terminalRow[0].terminalCount',
    ],
    [
      'row block with 61 contacts',
      (c: PanelContent) => (c.terminalRow[0]!.terminalCount = 61),
      'content.terminalRow[0].terminalCount',
    ],
    [
      'row block with the wrong width',
      (c: PanelContent) => (c.terminalRow[0]!.widthModules = 3),
      'content.terminalRow[0].widthModules',
    ],
    [
      'row block past the row end',
      (c: PanelContent) => (c.terminalRow[1]!.offsetModules = 60),
      'content.terminalRow[1].offsetModules',
    ],
    [
      'row block with a negative offset',
      (c: PanelContent) => (c.terminalRow[0]!.offsetModules = -1),
      'content.terminalRow[0].offsetModules',
    ],
    [
      'overlapping row blocks',
      (c: PanelContent) => (c.terminalRow[1]!.offsetModules = 1),
      'content.terminalRow[1].offsetModules',
    ],
    [
      'row block label of 17 characters',
      (c: PanelContent) => (c.terminalRow[0]!.label = 'x'.repeat(17)),
      'content.terminalRow[0].label',
    ],
    [
      'row block with an unknown colour',
      (c: PanelContent) => ((c.terminalRow[0] as { colour: unknown }).colour = 'pink'),
      'content.terminalRow[0].colour',
    ],
    [
      'rail block with 13 contacts',
      (c: PanelContent) => (c.rails[0]!.terminalBlocks[0]!.terminalCount = 13),
      'content.rails[0].terminalBlocks[0].terminalCount',
    ],
    [
      'rail block with 0 contacts',
      (c: PanelContent) => (c.rails[0]!.terminalBlocks[0]!.terminalCount = 0),
      'content.rails[0].terminalBlocks[0].terminalCount',
    ],
    [
      'rail block 2 modules wide',
      (c: PanelContent) => (c.rails[0]!.terminalBlocks[0]!.widthModules = 2),
      'content.rails[0].terminalBlocks[0].widthModules',
    ],
    [
      'rail block label of 17 characters',
      (c: PanelContent) => (c.rails[0]!.terminalBlocks[0]!.label = 'x'.repeat(17)),
      'content.rails[0].terminalBlocks[0].label',
    ],
    [
      'ATS 1 module wide',
      (c: PanelContent) => (c.rails[0]!.elements[0]!.widthModules = 1),
      'content.rails[0].elements[0].widthModules',
    ],
    [
      'ATS with poles',
      (c: PanelContent) =>
        ((c.rails[0]!.elements[0] as { poles: unknown }).poles = [{ transit: false }]),
      'content.rails[0].elements[0].poles',
    ],
    [
      'ATS with an on flag',
      (c: PanelContent) => ((c.rails[0]!.elements[0] as { on: unknown }).on = true),
      'content.rails[0].elements[0].on',
    ],
    [
      'device with a state',
      (c: PanelContent) => ((c.rails[0]!.elements[1] as { state: unknown }).state = 'A'),
      'content.rails[0].elements[1].state',
    ],
  ] as [string, (c: PanelContent) => void, string][])(
    'rejects a %s at its path',
    (_n, fn, path) => {
      expect(paths(edit(fn))).toContain(path)
    },
  )

  it('rejects more than 60 row blocks at content.terminalRow', () => {
    const c = content({
      terminalRow: Array.from({ length: 61 }, (_, i) => rowBlock(100 + i, i % 60, 1)),
    })
    expect(paths(c)).toContain('content.terminalRow')
  })

  it.each([
    [
      'an ATS output pole index 2',
      withWire(pole(id(21), 2, 'output') as never, cw(id(2)) as never),
      'content.wires[0].start.poleIndex',
    ],
    [
      'an ATS input pole index 4',
      withWire(cw(id(2)) as never, pole(id(21), 4, 'input') as never),
      'content.wires[0].end.poleIndex',
    ],
    [
      'contactSide top on a rail block',
      withWire(cw(id(2)) as never, term(id(40), 0, 'top')),
      'content.wires[0].end.contactSide',
    ],
    [
      'contactSide left on a row block',
      withWire(term(id(50), 0, 'left'), cw(id(2)) as never),
      'content.wires[0].start.contactSide',
    ],
    [
      'a row contact beyond the count',
      withWire(term(id(50), 3, 'top'), cw(id(2)) as never),
      'content.wires[0].start.terminalIndex',
    ],
    [
      'the top and bottom of one row contact',
      withWire(term(id(50), 1, 'top'), term(id(50), 1, 'bottom')),
      'content.wires[0].end',
    ],
    [
      'the left and right of one rail contact',
      withWire(term(id(40), 1, 'left'), term(id(40), 1, 'right')),
      'content.wires[0].end',
    ],
  ] as [string, PanelContent, string][])('rejects %s', (_n, c, path) => {
    expect(paths(c)).toContain(path)
  })

  it('two different contacts of one block are fine (the bar is joined, the nodes differ)', () => {
    expect(validateContent(withWire(term(id(50), 0, 'top'), term(id(50), 1, 'bottom')))).toEqual([])
  })
})

// ---------------------------------------------------------------- default colour

describe('defaultWireColour precedence: cable wire, coloured block, attached wire, toolbar', () => {
  const c0 = world()
  const coloured = (colour: 'red' | 'blue' | null): PanelContent => ({
    ...c0,
    terminalRow: c0.terminalRow.map((b, i) => (i === 0 ? { ...b, colour } : b)),
    rails: c0.rails.map((r, i) =>
      i === 0 ? { ...r, terminalBlocks: r.terminalBlocks.map((b) => ({ ...b, colour })) } : r,
    ),
  })

  it('a cable wire gives its own colour whatever the toolbar says', () => {
    expect(defaultWireColour(c0, cw(id(3)), 'red')).toBe('blue')
  })

  it('a coloured row block gives its colour', () => {
    expect(defaultWireColour(coloured('red'), term(id(50), 1, 'top'), 'black')).toBe('red')
  })

  it('a coloured rail block gives its colour', () => {
    expect(defaultWireColour(coloured('blue'), term(id(40), 0, 'left'), 'black')).toBe('blue')
  })

  it('a grey block (null) falls through to the toolbar colour', () => {
    expect(defaultWireColour(coloured(null), term(id(50), 1, 'top'), 'black')).toBe('black')
  })

  it('a coloured block beats a wire already attached to the contact', () => {
    const c: PanelContent = {
      ...coloured('red'),
      wires: [{ ...panelWire(30, term(id(50), 1, 'top'), cw(id(2))), colour: 'green-yellow' }],
    }
    expect(defaultWireColour(c, term(id(50), 1, 'top'), 'black')).toBe('red')
  })

  it('a grey block takes the colour of an attached wire, from either side of the node', () => {
    const c: PanelContent = {
      ...c0,
      wires: [{ ...panelWire(30, term(id(50), 1, 'top'), cw(id(2))), colour: 'green-yellow' }],
    }
    expect(defaultWireColour(c, term(id(50), 1, 'top'), 'black')).toBe('green-yellow')
    expect(defaultWireColour(c, term(id(50), 1, 'bottom'), 'black')).toBe('green-yellow')
    expect(defaultWireColour(c, term(id(50), 0, 'top'), 'black')).toBe('black')
  })

  it('an ATS contact takes its attached wire colour, otherwise the toolbar colour', () => {
    const c: PanelContent = {
      ...c0,
      wires: [{ ...panelWire(30, cw(id(2)), pole(id(21), 2, 'input')), colour: 'blue' }],
    }
    expect(defaultWireColour(c, pole(id(21), 2, 'input'), 'red')).toBe('blue')
    expect(defaultWireColour(c, pole(id(21), 3, 'input'), 'red')).toBe('red')
  })

  it('an unknown block id falls back to the toolbar colour (error)', () => {
    expect(defaultWireColour(c0, term(id(99), 0, 'top'), 'red')).toBe('red')
  })
})

// ---------------------------------------------------------------- commands

describe('addRowBlock', () => {
  it('adds a block in order of offset', () => {
    const c = run(world(), addRowBlock('top', rowBlock(52, 2, 2))).content
    expect(c.terminalRow.map((b) => b.id)).toEqual([id(50), id(52), id(51)])
  })

  it.each([
    ['overlapping a block', rowBlock(52, 1, 2), 'overlap'],
    ['past the row end', rowBlock(52, 59, 4), 'outOfRow'],
    ['with a negative offset', rowBlock(52, -1, 2), 'negativeOffset'],
    ['with a duplicate id', rowBlock(50, 20, 2), 'duplicateId'],
    ['with 61 contacts', rowBlock(52, 10, 61), 'limit'],
    ['with 0 contacts', { ...rowBlock(52, 10, 1), terminalCount: 0 }, 'invalid'],
    ['with the wrong width', { ...rowBlock(52, 10, 4), widthModules: 1 }, 'invalid'],
    ['with a 17 character label', { ...rowBlock(52, 10, 2), label: 'x'.repeat(17) }, 'invalid'],
    ['with an unknown colour', { ...rowBlock(52, 10, 2), colour: 'pink' as never }, 'invalid'],
  ])('rejects a block %s', (_n, b, reason) => {
    expect(rejection(addRowBlock('top', b)(world()))).toBe(reason)
  })

  it('accepts 60 contacts on a full 30-module block ending exactly at the row capacity', () => {
    // 60-module rail: capacity 60, [30, 60) fits, [31, 61) does not
    const wide = { ...world(), railWidthModules: 60 }
    expect(addRowBlock('top', rowBlock(52, 30, 60))(wide).ok).toBe(true)
    expect(rejection(addRowBlock('top', rowBlock(52, 31, 60))(wide))).toBe('outOfRow')
  })

  it('rejects the 61st block of the row (limit)', () => {
    const full = content({
      terminalRow: Array.from({ length: 60 }, (_, i) => rowBlock(100 + i, i, 1)),
    })
    const out = addRowBlock('top', rowBlock(999, 0, 1))(full)
    expect(out).toEqual({ ok: false, reason: 'limit', detail: 'row blocks' })
  })
})

describe('addBlock (rail block)', () => {
  it('accepts 12 contacts and rejects 13 as limit', () => {
    expect(addBlock(id(11), block(60, 0, 1, 12))(world()).ok).toBe(true)
    expect(addBlock(id(11), block(60, 0, 1, 13))(world())).toEqual({
      ok: false,
      reason: 'limit',
      detail: 'rail terminals',
    })
  })
  it.each([
    ['2 modules wide', block(60, 0, 2, 2), 'invalid'],
    ['on a taken span', block(60, 4, 1, 2), 'overlap'],
    ['past the rail', block(60, 24, 1, 2), 'outOfRail'],
  ])('rejects a block %s on rail 1', (_n, b, reason) => {
    expect(rejection(addBlock(id(10), b)(world()))).toBe(reason)
  })
})

describe('moveRowBlock', () => {
  it('moves a block and keeps its wires attached and orthogonal', () => {
    const c0 = run(world(), addAuto(30, term(id(50), 1, 'top'), cw(id(2)))).content
    const out = run(c0, moveRowBlock(id(50), 10))
    expect(out.content.terminalRow.map((b) => [b.id, b.offsetModules])).toEqual([
      [id(51), 4],
      [id(50), 10],
    ])
    expect(out.content.wires).toHaveLength(1)
    expect(allOrthogonal(out.content)).toBe(true)
    const l = computeLayout(out.content)
    expect(wirePolyline(l, out.content.wires[0]!)![0]).toEqual(
      endpointPoint(l, term(id(50), 1, 'top')),
    )
  })
  it('the same offset changes nothing (same reference)', () => {
    const c = world()
    expect(run(c, moveRowBlock(id(50), 0)).content).toBe(c)
  })
  it.each([
    ['onto a neighbour', id(50), 3, 'overlap'],
    ['past the row end', id(51), 60, 'outOfRow'],
    ['to a negative offset', id(51), -1, 'negativeOffset'],
    ['an unknown block', id(99), 1, 'notFound'],
    ['a rail block as a row block', id(40), 1, 'notFound'],
  ])('rejects moving %s', (_n, blockId, offset, reason) => {
    expect(rejection(moveRowBlock(blockId, offset)(world()))).toBe(reason)
  })
  it('moveItem refuses a row block (it has no rail)', () => {
    expect(moveItem(id(50), id(10), 12)(world())).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'row block',
    })
  })
})

describe('copyItem', () => {
  const c0 = run(world(), addAuto(30, cw(id(2)), pole(id(21), 0, 'input'))).content

  it('copies a device to another rail: new id, same settings, no wires, source untouched', () => {
    const src = {
      ...element(20, 4, 2, 2),
      label: 'Q1',
      marking: 'QF',
      on: false,
      poles: [{ transit: true }, { transit: false }],
    }
    const base = content({
      rails: [rail(10, 24, 150, [src]), rail(11, 24, 100)],
      wires: [],
    })
    const withWire = run(base, addAuto(30, cw(id(2)), pole(id(20), 0, 'input'))).content
    const out = run(withWire, copyItem(id(20), id(70), { railId: id(11) }, 3))
    expect(out.content.rails[1]!.elements).toEqual([{ ...src, id: id(70), offsetModules: 3 }])
    expect(out.content.rails[0]!.elements).toEqual([src])
    expect(out.content.wires).toHaveLength(1) // only the original wire
    expect(out.removedWires).toBe(0)
  })

  it('copies an ATS with its state and swapped sides', () => {
    const c = run(
      c0,
      updateElement(id(21), { state: 'B', sidesSwapped: true, label: 'QA1' }),
    ).content
    const out = run(c, copyItem(id(21), id(71), { railId: id(11) }, 0)).content
    const copy = out.rails[1]!.elements[0]!
    expect(copy).toMatchObject({
      kind: 'ats',
      id: id(71),
      state: 'B',
      sidesSwapped: true,
      label: 'QA1',
      widthModules: 2,
    })
  })

  it('copies a rail block with its colour, label and contact count', () => {
    const c = run(
      world(),
      updateBlock(id(40), { colour: 'red', label: 'PE', terminalCount: 5 }),
    ).content
    const out = run(c, copyItem(id(40), id(72), { railId: id(11) }, 2)).content
    expect(out.rails[1]!.terminalBlocks[0]).toEqual({
      id: id(72),
      offsetModules: 2,
      widthModules: 1,
      terminalCount: 5,
      colour: 'red',
      label: 'PE',
    })
  })

  it('copies a row block within the row', () => {
    const out = run(world(), copyItem(id(50), id(73), { row: 'top' }, 10)).content
    expect(out.terminalRow.map((b) => b.id)).toEqual([id(50), id(51), id(73)])
    expect(out.terminalRow[2]).toEqual({ ...world().terminalRow[0], id: id(73), offsetModules: 10 })
  })

  it('drops on its own position are an overlap, nothing is created', () => {
    expect(rejection(copyItem(id(20), id(70), { railId: id(10) }, 4)(c0))).toBe('overlap')
    expect(rejection(copyItem(id(21), id(70), { railId: id(10) }, 0)(c0))).toBe('overlap')
    expect(rejection(copyItem(id(40), id(70), { railId: id(10) }, 10)(c0))).toBe('overlap')
    expect(rejection(copyItem(id(50), id(70), { row: 'top' }, 0)(c0))).toBe('overlap')
  })

  it.each([
    ['a device into the row', id(20), { row: 'top' } as const],
    ['an ATS into the row', id(21), { row: 'top' } as const],
    ['a rail block into the row', id(40), { row: 'top' } as const],
    ['a row block onto a rail', id(50), { railId: id(11) }],
  ])('cross-zone: %s is invalid', (_n, source, target) => {
    expect(copyItem(source, id(70), target, 8)(c0)).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'zone',
    })
  })

  it.each([
    ['an unknown source', id(99), id(70), { railId: id(11) }, 'notFound'],
    ['an unknown rail', id(20), id(70), { railId: id(99) }, 'notFound'],
    ['a taken id', id(20), id(30), { railId: id(11) }, 'duplicateId'],
    ['the id of the source', id(20), id(20), { railId: id(11) }, 'duplicateId'],
  ] as const)('rejects %s', (_n, source, newId, target, reason) => {
    expect(rejection(copyItem(source, newId, target, 0)(c0))).toBe(reason)
  })

  it('a copy past the rail end or the row end is rejected', () => {
    expect(rejection(copyItem(id(20), id(70), { railId: id(11) }, 23)(c0))).toBe('outOfRail')
    expect(rejection(copyItem(id(51), id(70), { row: 'top' }, 60)(c0))).toBe('outOfRow')
  })
})

describe('updateBlock on a row block', () => {
  const wired = (n = 3) => run(world(), addAuto(30, term(id(50), n - 1, 'top'), cw(id(2)))).content

  it('growing 3 -> 4 contacts widens the box to 2 modules (unchanged here) and keeps the wire attached', () => {
    const out = run(wired(), updateBlock(id(50), { terminalCount: 4 })).content
    expect(out.terminalRow[0]).toMatchObject({ terminalCount: 4, widthModules: 2 })
    expect(out.wires).toHaveLength(1)
    expect(allOrthogonal(out)).toBe(true)
  })

  it('growing 3 -> 5 widens to 3 modules; the contact x moves and the wire is re-routed orthogonally', () => {
    const c = wired(1)
    const out = run(c, updateBlock(id(50), { terminalCount: 5 })).content
    expect(out.terminalRow[0]).toMatchObject({ terminalCount: 5, widthModules: 3 })
    const l = computeLayout(out)
    expect(endpointPoint(l, term(id(50), 0, 'top'))!.x).not.toBe(
      endpointPoint(computeLayout(c), term(id(50), 0, 'top'))!.x,
    )
    expect(allOrthogonal(out)).toBe(true)
    const poly = wirePolyline(l, out.wires[0]!)!
    expect(poly[0]).toEqual(endpointPoint(l, term(id(50), 0, 'top')))
  })

  it('growing into the neighbour is an overlap and changes nothing', () => {
    // block 50 spans [0,2); block 51 starts at 4: 7 contacts need 4 modules -> [0,4) fits, 8 need 4 too, 9 need 5
    expect(
      run(world(), updateBlock(id(50), { terminalCount: 8 })).content.terminalRow[0]?.widthModules,
    ).toBe(4)
    expect(rejection(updateBlock(id(50), { terminalCount: 9 })(world()))).toBe('overlap')
  })

  it('growing past the row end is outOfRow', () => {
    const c = run(world(), moveRowBlock(id(51), 23)).content // [23, 24): the last module of the capacity 24
    expect(rejection(updateBlock(id(51), { terminalCount: 6 })(c))).toBe('outOfRow')
  })

  it('shrinking drops the wires on removed contacts and reports their count', () => {
    let c = run(world(), addAuto(30, term(id(50), 2, 'top'), cw(id(2)))).content
    c = run(c, addAuto(31, term(id(50), 2, 'bottom'), cw(id(3)))).content
    c = run(c, addAuto(32, term(id(50), 0, 'top'), cw(id(3)))).content
    const out = run(c, updateBlock(id(50), { terminalCount: 2 }))
    expect(out.removedWires).toBe(2)
    expect(out.content.wires.map((w) => w.id)).toEqual([id(32)])
    expect(out.content.terminalRow[0]).toMatchObject({ terminalCount: 2, widthModules: 1 })
  })

  it('colour and label change without touching wires', () => {
    const c = wired()
    const out = run(c, updateBlock(id(50), { colour: 'blue', label: 'N' })).content
    expect(out.terminalRow[0]).toMatchObject({ colour: 'blue', label: 'N' })
    expect(out.wires).toBe(c.wires)
    expect(
      run(out, updateBlock(id(50), { colour: null })).content.terminalRow[0]?.colour,
    ).toBeNull()
  })

  it('an identical patch returns the same content', () => {
    const c = world()
    expect(run(c, updateBlock(id(50), { terminalCount: 3, label: '' })).content).toBe(c)
  })

  it.each([
    ['0 contacts', { terminalCount: 0 }, 'invalid'],
    ['61 contacts', { terminalCount: 61 }, 'limit'],
    ['a 17 character label', { label: 'x'.repeat(17) }, 'invalid'],
    ['an unknown colour', { colour: 'pink' as never }, 'invalid'],
  ])('rejects %s', (_n, patch, reason) => {
    expect(rejection(updateBlock(id(50), patch)(world()))).toBe(reason)
  })
})

describe('updateBlock on a rail block', () => {
  it('keeps width 1 for any count 1..12 and rejects 13 as limit', () => {
    for (const n of [1, 6, 12]) {
      const out = run(world(), updateBlock(id(40), { terminalCount: n })).content
      expect(out.rails[0]!.terminalBlocks[0]).toMatchObject({ terminalCount: n, widthModules: 1 })
    }
    expect(updateBlock(id(40), { terminalCount: 13 })(world())).toEqual({
      ok: false,
      reason: 'limit',
      detail: 'rail terminals',
    })
  })

  it('shrinking removes the wires of the removed contacts from both sides', () => {
    let c = run(world(), addAuto(30, term(id(40), 2, 'left'), cw(id(2)))).content
    c = run(c, addAuto(31, term(id(40), 2, 'right'), cw(id(3)))).content
    c = run(c, addAuto(32, term(id(40), 0, 'left'), cw(id(3)))).content
    const out = run(c, updateBlock(id(40), { terminalCount: 2 }))
    expect(out.removedWires).toBe(2)
    expect(out.content.wires.map((w) => w.id)).toEqual([id(32)])
  })

  it('removeBlock drops every wire to the block, from any side', () => {
    let c = run(world(), addAuto(30, term(id(40), 0, 'left'), cw(id(2)))).content
    c = run(c, addAuto(31, term(id(40), 1, 'right'), cw(id(3)))).content
    const out = run(c, removeBlock(id(40)))
    expect(out.removedWires).toBe(2)
    expect(out.content.wires).toEqual([])
  })
})

describe('ATS commands', () => {
  const c0 = world()
  it.each(['A', 'B', 'off'] as const)('sets the state %s', (state) => {
    const out = run(c0, updateElement(id(21), { state })).content
    expect(out.rails[0]!.elements[0]).toMatchObject({ kind: 'ats', state })
  })

  it('setting the same state returns the same content', () => {
    expect(run(c0, updateElement(id(21), { state: 'A' })).content).toBe(c0)
  })

  it('a state change keeps wires and does not re-route them', () => {
    const c = run(c0, addAuto(30, cw(id(2)), pole(id(21), 0, 'input'))).content
    const out = run(c, updateElement(id(21), { state: 'B' })).content
    expect(out.wires).toBe(c.wires)
  })

  it('label and marking within the limits are stored', () => {
    const out = run(c0, updateElement(id(21), { label: 'Q'.repeat(16), marking: 'AVR123' })).content
    expect(out.rails[0]!.elements[0]).toMatchObject({ label: 'Q'.repeat(16), marking: 'AVR123' })
  })

  it.each([
    ['a 17 character label', { label: 'x'.repeat(17) }, 'invalid'],
    ['a 7 character marking', { marking: 'x'.repeat(7) }, 'invalid'],
    ['width 1', { widthModules: 1 }, 'tooNarrowForAts'],
    ['width 5 into the neighbour at 4', { widthModules: 5 }, 'overlap'],
    ['a state outside A/B/off', { state: 'C' as never }, 'invalid'],
    ['a pole count', { poleCount: 2 }, 'invalid'],
    ['an on flag', { on: true }, 'invalid'],
  ])('rejects %s', (_n, patch, reason) => {
    expect(rejection(updateElement(id(21), patch)(c0))).toBe(reason)
  })

  it('width 4 into free space is stored and re-routes wires on the moved contacts', () => {
    const c = run(c0, addAuto(30, cw(id(2)), pole(id(21), 3, 'input'))).content
    const out = run(c, updateElement(id(21), { widthModules: 4 })).content
    expect(out.rails[0]!.elements[0]!.widthModules).toBe(4)
    expect(allOrthogonal(out)).toBe(true)
    const l = computeLayout(out)
    expect(wirePolyline(l, out.wires[0]!)!.slice(-1)[0]).toEqual(
      endpointPoint(l, pole(id(21), 3, 'input')),
    )
  })

  it('sidesSwapped re-routes wires and keeps them on the same logical contacts', () => {
    const c = run(c0, addAuto(30, cw(id(2)), pole(id(21), 1, 'input'))).content
    const out = run(c, updateElement(id(21), { sidesSwapped: true })).content
    expect(out.wires[0]!.end).toEqual(pole(id(21), 1, 'input'))
    expect(allOrthogonal(out)).toBe(true)
  })

  it('a device refuses a state patch, and a transit patch of an ATS is invalid', () => {
    expect(updateElement(id(20), { state: 'A' })(c0)).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'kind',
    })
    expect(setPoleTransit(id(21), 0, true)(c0)).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'kind',
    })
  })

  it('addElement of an ATS: width 2 ok, width 1 tooNarrowForAts, bad state invalid, overlap', () => {
    const base = content({ rails: [rail(10, 24, 150)] })
    expect(addElement(id(10), ats(21, 0, 2))(base).ok).toBe(true)
    expect(rejection(addElement(id(10), ats(21, 0, 1))(base))).toBe('tooNarrowForAts')
    expect(rejection(addElement(id(10), ats(21, 0, 2, { state: 'X' as never }))(base))).toBe(
      'invalid',
    )
    const one = run(base, addElement(id(10), ats(21, 0, 2))).content
    expect(rejection(addElement(id(10), ats(22, 1, 2))(one))).toBe('overlap')
  })

  it('removeElement of an ATS drops the wires of all its contacts', () => {
    let c = run(c0, addAuto(30, cw(id(2)), pole(id(21), 3, 'input'))).content
    c = run(c, addAuto(31, pole(id(21), 1, 'output'), term(id(40), 0, 'left'))).content
    const out = run(c, removeElement(id(21)))
    expect(out.removedWires).toBe(2)
    expect(out.content.wires).toEqual([])
  })
})

describe('addWire with side contacts', () => {
  it('draws from the top and the bottom of a row block, and from both sides of a rail block', () => {
    let c = world()
    c = run(c, addAuto(30, term(id(50), 0, 'top'), cw(id(2)))).content
    c = run(c, addAuto(31, term(id(50), 1, 'bottom'), pole(id(21), 0, 'input'))).content
    c = run(c, addAuto(32, term(id(40), 1, 'left'), pole(id(20), 0, 'output'))).content
    c = run(c, addAuto(33, term(id(40), 1, 'right'), pole(id(21), 1, 'output'))).content
    expect(c.wires).toHaveLength(4)
    expect(allOrthogonal(c)).toBe(true)
    expect(validateContent(c)).toEqual([])
  })

  it.each([
    ['row top to bottom', term(id(50), 1, 'top'), term(id(50), 1, 'bottom')],
    ['rail left to right', term(id(40), 1, 'left'), term(id(40), 1, 'right')],
    ['the same side', term(id(50), 1, 'top'), term(id(50), 1, 'top')],
  ])('refuses a wire on one contact: %s (sameTerminal)', (_n, a, b) => {
    expect(rejection(addWire(newWire(30, a, b))(world()))).toBe('sameTerminal')
  })

  it('a wire between two different contacts of the same block is allowed', () => {
    const c = run(world(), addAuto(30, term(id(50), 0, 'top'), term(id(50), 1, 'top'))).content
    expect(c.wires).toHaveLength(1)
  })

  it.each([
    ['a side that does not exist on a row block', term(id(50), 0, 'left')],
    ['a side that does not exist on a rail block', term(id(40), 0, 'bottom')],
    ['an ATS output 2', pole(id(21), 2, 'output')],
    ['an ATS input 4', pole(id(21), 4, 'input')],
  ])('refuses %s as notFound', (_n, end) => {
    expect(rejection(addWire(newWire(30, cw(id(2)), end))(world()))).toBe('notFound')
  })
})

describe('wires follow moved items (repairRoutes)', () => {
  it('moving an ATS to another offset keeps wires orthogonal and attached', () => {
    const c = run(world(), addAuto(30, cw(id(2)), pole(id(21), 2, 'input'))).content
    const out = run(c, moveItem(id(21), id(11), 5)).content
    expect(allOrthogonal(out)).toBe(true)
    const l = computeLayout(out)
    expect(wirePolyline(l, out.wires[0]!)!.slice(-1)[0]).toEqual(
      endpointPoint(l, pole(id(21), 2, 'input')),
    )
  })

  it('moving a rail block with side-wired contacts keeps the wires orthogonal', () => {
    let c = run(world(), addAuto(30, term(id(40), 0, 'left'), cw(id(2)))).content
    c = run(c, addAuto(31, term(id(40), 2, 'right'), pole(id(21), 1, 'output'))).content
    const out = run(c, moveItem(id(40), id(11), 3)).content
    expect(allOrthogonal(out)).toBe(true)
  })
})

describe('descriptions of the new kinds', () => {
  const c = content({
    inputCables: [inputCable(1, [2, 3])],
    terminalRow: [{ ...rowBlock(50, 0, 3), label: 'N' }, rowBlock(51, 4, 2)],
    bottomTerminalRow: [rowBlock(52, 1, 2), { ...rowBlock(53, 5, 2), label: 'PE' }],
    rails: [
      rail(
        10,
        24,
        150,
        [ats(21, 0, 2, { label: 'QA1' }), ats(22, 4, 2), ats(23, 8, 2, { marking: 'AV' })],
        [{ ...block(40, 12, 1, 3), label: 'PE' }, block(41, 14, 1, 2)],
      ),
    ],
  })
  it.each([
    [pole(id(21), 0, 'input'), 'АВР QA1, вхід А L'],
    [pole(id(21), 1, 'input'), 'АВР QA1, вхід А N'],
    [pole(id(21), 2, 'input'), 'АВР QA1, вхід Б L'],
    [pole(id(21), 3, 'input'), 'АВР QA1, вхід Б N'],
    [pole(id(21), 0, 'output'), 'АВР QA1, вихід L'],
    [pole(id(21), 1, 'output'), 'АВР QA1, вихід N'],
    [pole(id(23), 0, 'input'), 'АВР AV, вхід А L'], // the marking wins over the label
    [pole(id(22), 3, 'input'), 'АВР №2, вхід Б N'], // unnamed: position among elements
    [term(id(50), 1, 'top'), 'клемник у верхньому ряду N, клема 2 (зверху)'],
    [term(id(51), 0, 'bottom'), 'клемник у верхньому ряду №2, клема 1 (знизу)'],
    [term(id(52), 0, 'top'), 'клемник у нижньому ряду №1, клема 1 (зверху)'],
    [term(id(53), 1, 'bottom'), 'клемник у нижньому ряду PE, клема 2 (знизу)'],
    [term(id(40), 1, 'left'), 'клемний блок PE, клема 2 (ліворуч)'],
    [term(id(41), 0, 'right'), 'клемний блок №2, клема 1 (праворуч)'],
  ])('%j reads "%s"', (endpoint, text) => {
    expect(describeEndpoint(c, endpoint, t)).toBe(text)
  })

  it('an unknown ATS or block does not throw (error)', () => {
    expect(describeEndpoint(c, term(id(99), 0, 'left'), t)).toBe(
      'клемний блок №?, клема 1 (ліворуч)',
    )
    expect(describeEndpoint(c, pole(id(99), 0, 'input'), t)).toBe('апарат ?, полюс 1 (вхід)')
  })

  it('describes an ATS element with its state', () => {
    expect(describeElement(ats(21, 0, 2, { label: 'QA1', state: 'B' }), t)).toBe(
      'QA1, 2 мод., стан: Б',
    )
    expect(describeElement(ats(21, 0, 3, { marking: 'M', state: 'off' }), t)).toBe(
      'АВР (M), 3 мод., стан: 0',
    )
    expect(['A', 'B', 'off'].map((s) => atsStateName(s as AtsState, t))).toEqual(['А', 'Б', '0'])
  })
})

describe('defaultWireColour from a coloured bottom-row block', () => {
  const c = content({
    bottomTerminalRow: [{ ...rowBlock(60, 0, 2), colour: 'green-yellow' }, rowBlock(61, 3, 2)],
  })

  it('takes the colour of the block the wire starts on', () => {
    expect(defaultWireColour(c, term(id(60), 1, 'bottom'), 'black')).toBe('green-yellow')
    expect(defaultWireColour(c, term(id(60), 0, 'top'), 'black')).toBe('green-yellow')
  })

  it('a grey bottom-row block and an unknown block fall back to the toolbar colour', () => {
    expect(defaultWireColour(c, term(id(61), 0, 'top'), 'red')).toBe('red')
    expect(defaultWireColour(c, term(id(99), 0, 'top'), 'red')).toBe('red')
  })
})
