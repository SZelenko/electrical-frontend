/** `convertLayout`: a layoutVersion 1 panel is redrawn for the compact layout. */
import { describe, expect, it } from 'vitest'
import { routeEquals } from '../autoRoute'
import { computeLayout, endpointPoint, type Pt } from '../geometry'
import { computeLayoutV1 } from '../geometryV1'
import { convertLayout } from '../layoutConversion'
import type { Endpoint, PanelContent, PanelWire } from '../panelContent'
import { autoRouteFor } from '../routes'
import {
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  panelWire,
  pole,
  rail,
  rowBlock,
  term,
} from './helpers'

const sixOutputs = Array.from({ length: 6 }, (_, i) =>
  outputCable(
    100 + i,
    Array.from({ length: 4 }, (_, w) => 1000 + i * 10 + w),
  ),
)

const base = (wires: PanelWire[] = []): PanelContent =>
  content({
    layoutVersion: 1,
    railWidthModules: 10,
    inputCables: [inputCable(1, [2, 3])],
    outputCables: sixOutputs, // 5 + 1 lines in the current layout
    rails: [rail(10, 10, 150, [element(20, 0, 2, 2)], [block(40, 6, 1, 2)])],
    bottomTerminalRow: [rowBlock(41, 2, 2)],
    wires,
  })

/** A wire whose bends are the automatic route of the v1 layout. */
function v1Wire(n: number, start: Endpoint, end: Endpoint): PanelWire {
  const layout = computeLayoutV1(base())
  return panelWire(n, start, end, autoRouteFor(layout, { start, end }) as Pt[])
}

const byId = (c: PanelContent, n: number) => c.wires.find((w) => w.id === id(n)) as PanelWire

describe('convertLayout', () => {
  const v1 = computeLayoutV1(base())
  const v2 = computeLayout({ ...base(), layoutVersion: 2 })
  const shift = { x: v2.railsLeft - v1.railsLeft, y: v2.railsTop - v1.railsTop }

  const wires = () => {
    const cable = v1Wire(30, cw(id(2)), pole(id(20), 0, 'input'))
    const outCable = v1Wire(33, cw(id(1000)), pole(id(20), 0, 'output'))
    const shifted = v1Wire(31, pole(id(20), 1, 'output'), term(id(40), 0, 'left'))
    // the auto route of a pair whose ends move differently (the bottom row follows the wrapped output band)
    const stretched = v1Wire(34, pole(id(20), 1, 'output'), term(id(41), 1, 'top'))
    const s = endpointPoint(v1, pole(id(20), 0, 'output')) as Pt
    const e = endpointPoint(v1, term(id(41), 0, 'top')) as Pt
    const mid = s.y + 100
    const user = panelWire(32, pole(id(20), 0, 'output'), term(id(41), 0, 'top'), [
      { x: s.x, y: mid },
      { x: e.x, y: mid },
    ])
    return { cable, outCable, shifted, stretched, user }
  }

  const input = () => {
    const w = wires()
    return { w, c: base([w.cable, w.shifted, w.user, w.outCable, w.stretched]) }
  }

  it('sets layoutVersion 2', () => {
    expect(convertLayout(base()).content.layoutVersion).toBe(2)
  })

  it('the layouts really differ (the scenario is meaningful)', () => {
    expect(shift).toEqual({ x: 0, y: -150 })
    expect(Math.max(...v2.outputBoxes.map((b) => b.line))).toBe(1)
  })

  it('a wire on an input cable gets the fresh v2 auto route', () => {
    const { c, w } = input()
    const out = convertLayout(c)
    const expected = autoRouteFor(v2, { start: w.cable.start, end: w.cable.end })
    expect(byId(out.content, 30).bends).toEqual(expected)
    expect(routeEquals(byId(out.content, 30).bends, w.cable.bends)).toBe(false)
  })

  it('a wire on a wrapped output cable gets the fresh v2 auto route including the pass through the gaps', () => {
    const { c, w } = input()
    const out = convertLayout(c)
    expect(byId(out.content, 33).bends).toEqual(
      autoRouteFor(v2, { start: w.outCable.start, end: w.outCable.end }),
    )
  })

  it('a wire whose ends moved equally is shifted rigidly', () => {
    const { c, w } = input()
    const out = convertLayout(c)
    expect(byId(out.content, 31).bends).toEqual(
      w.shifted.bends.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })),
    )
  })

  it('an automatic route whose ends moved differently is drawn again', () => {
    const { c, w } = input()
    const out = convertLayout(c)
    expect(byId(out.content, 34).bends).toEqual(
      autoRouteFor(v2, { start: w.stretched.start, end: w.stretched.end }),
    )
  })

  it('a user route keeps its bends (end segments stay attached) when it stays aligned', () => {
    const { c, w } = input()
    const out = convertLayout(c)
    expect(byId(out.content, 32).bends).toEqual(w.user.bends)
  })

  it('counts the wires whose bends changed (the unchanged user route is not counted)', () => {
    const { c } = input()
    expect(convertLayout(c).rerouted).toBe(4)
  })

  it('is idempotent: converting the result changes nothing', () => {
    const once = convertLayout(input().c)
    const twice = convertLayout(once.content)
    expect(twice.rerouted).toBe(0)
    expect(twice.content).toBe(once.content)
  })

  it('leaves a v2 panel untouched (same object, nothing re-routed)', () => {
    const v2Panel = { ...input().c, layoutVersion: 2 as const }
    const out = convertLayout(v2Panel)
    expect(out.content).toBe(v2Panel)
    expect(out.rerouted).toBe(0)
  })

  it('a v1 panel without wires reports 0 and only raises the version', () => {
    const out = convertLayout(base())
    expect(out.rerouted).toBe(0)
    expect(out.content).toEqual({ ...base(), layoutVersion: 2 })
  })

  it('does not touch anything but layoutVersion and wire bends', () => {
    const { c } = input()
    const out = convertLayout(c).content
    expect({ ...out, wires: [], layoutVersion: 1 }).toEqual({ ...c, wires: [] })
    expect(out.wires.map((w) => [w.id, w.start, w.end])).toEqual(
      c.wires.map((w) => [w.id, w.start, w.end]),
    )
  })
})
