import { describe, expect, it } from 'vitest'
import {
  addElement,
  addWire,
  addRail,
  defaultInputCable,
  removeElement,
  updateElement,
  type Command,
} from '../commands'
import { computeLayout, endpointPoint } from '../geometry'
import type { Endpoint, PanelContent, PanelElement } from '../panelContent'
import { autoRouteFor } from '../routes'
import { validateContent } from '../validateContent'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** Adds a wire along the automatic orthogonal route (wires carry their drawn bends since the drawing rework). */
const addAuto =
  (n: number, start: Endpoint, end: Endpoint): Command =>
  (c) =>
    addWire({
      id: id(n),
      start,
      end,
      colour: 'brown',
      crossSection: '2.5',
      bends: autoRouteFor(computeLayout(c), { start, end }) ?? [],
    })(c)
const empty: PanelContent = {
  layoutVersion: 2,
  railWidthModules: 60,
  inputCableSide: 'top',
  outputCableSide: 'bottom',
  inputCables: [defaultInputCable(id(1), id(2), id(3))],
  outputCables: [],
  terminalRow: [],
  bottomTerminalRow: [],
  rails: [],
  wires: [],
}
const element = (n: number, offset: number): PanelElement => ({
  kind: 'device',
  style: 'breaker',
  state: null,
  id: id(n),
  offsetModules: offset,
  widthModules: 2,
  label: '',
  marking: '',
  on: true,
  sidesSwapped: false,
  poles: [{ transit: false }, { transit: false }],
})

function run(content: PanelContent, command: Command) {
  const outcome = command(content)
  if (!outcome.ok) throw new Error(outcome.reason)
  return outcome
}

describe('editor commands', () => {
  const rail = run(empty, addRail({ id: id(10) })).content
  const withEl = run(rail, addElement(id(10), element(20, 0))).content
  const wired = run(
    withEl,
    addAuto(
      30,
      { kind: 'cableWire', cableWireId: id(2) },
      { kind: 'pole', elementId: id(20), poleIndex: 0, side: 'input' },
    ),
  ).content

  it('stores an orthogonal auto route that ends on the terminals and validates', () => {
    expect(validateContent(wired)).toEqual([])
    const layout = computeLayout(wired)
    const wire = wired.wires[0]!
    const end = endpointPoint(layout, wire.end)!
    const last = wire.bends[wire.bends.length - 1]!
    expect(last.x === end.x || last.y === end.y).toBe(true)
  })

  it('rejects an overlapping element and keeps the content', () => {
    const outcome = addElement(id(10), element(21, 1))(withEl)
    expect(outcome).toEqual({ ok: false, reason: 'overlap' })
  })

  it('cascades attached wires when a pole is removed and reports the count', () => {
    const outcome = run(wired, updateElement(id(20), { poleCount: 1, widthModules: 1 }))
    expect(outcome.removedWires).toBe(0)
    const wiredPole1 = run(
      wired,
      addAuto(
        31,
        { kind: 'cableWire', cableWireId: id(2) },
        { kind: 'pole', elementId: id(20), poleIndex: 1, side: 'output' },
      ),
    ).content
    expect(run(wiredPole1, updateElement(id(20), { poleCount: 1 })).removedWires).toBe(1)
    expect(run(wiredPole1, removeElement(id(20))).removedWires).toBe(2)
  })

  it('rejects shrinking an element below its pole density', () => {
    const four = run(withEl, updateElement(id(20), { poleCount: 8 })).content
    expect(updateElement(id(20), { widthModules: 1 })(four)).toEqual({
      ok: false,
      reason: 'tooNarrowForPoles',
    })
  })
})
