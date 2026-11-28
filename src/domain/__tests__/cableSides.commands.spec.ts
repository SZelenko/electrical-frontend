/** setCableSides, default cables (2 wires), and the drawing-range check of cable commands. Success + Error. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { panelsApi, type Panel } from '@/api/panels'
import {
  addCableWire,
  addInputCable,
  addOutputCable,
  defaultInputCable,
  defaultOutputCable,
  moveBend,
  setCableSides,
} from '../commands'
import { MAX_COORD_U } from '../limits'
import { computeLayout, endpointDirection, endpointPoint } from '../geometry'
import { CABLE_SIDES, type CableSide, type PanelContent, type PanelWire } from '../panelContent'
import { autoRouteFor } from '../routes'
import { validateContent } from '../validateContent'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'
import {
  addAuto,
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
  rejection,
  run,
} from './helpers'

const world = buildWorld()
const wireOf = (c: PanelContent, n: number) => c.wires.find((w) => w.id === id(n)) as PanelWire
const bends = (c: PanelContent, n: number) => wireOf(c, n).bends

function orthogonal(c: PanelContent): boolean {
  const l = computeLayout(c)
  return c.wires.every((w) => {
    const pts = [endpointPoint(l, w.start)!, ...w.bends, endpointPoint(l, w.end)!]
    return pts.every((a, i) => !pts[i + 1] || a.x === pts[i + 1]!.x || a.y === pts[i + 1]!.y)
  })
}

describe('setCableSides: success', () => {
  it.each(CABLE_SIDES.flatMap((i) => CABLE_SIDES.map((o) => [i, o] as const)))(
    'inputs %s, outputs %s is accepted and stored',
    (input, output) => {
      const out = run(world, setCableSides({ input, output })).content
      expect(out.inputCableSide).toBe(input)
      expect(out.outputCableSide).toBe(output)
      expect(validateContent(out)).toEqual([])
      expect(out.rails).toBe(world.rails)
      expect(out.inputCables).toBe(world.inputCables)
    },
  )

  it('changes one kind and leaves the other', () => {
    expect(run(world, setCableSides({ input: 'left' })).content).toMatchObject({
      inputCableSide: 'left',
      outputCableSide: 'bottom',
    })
    expect(run(world, setCableSides({ output: 'right' })).content).toMatchObject({
      inputCableSide: 'top',
      outputCableSide: 'right',
    })
  })

  it('the same sides are a no-op (same reference, nothing recorded)', () => {
    expect(run(world, setCableSides({})).content).toBe(world)
    expect(run(world, setCableSides({ input: 'top', output: 'bottom' })).content).toBe(world)
  })

  it('removes no wires', () => {
    expect(run(world, setCableSides({ input: 'left', output: 'right' })).removedWires).toBe(0)
    expect(
      run(world, setCableSides({ input: 'left', output: 'right' })).content.wires,
    ).toHaveLength(world.wires.length)
  })
})

describe('setCableSides: wire routes', () => {
  it('wires on a moved cable get a fresh automatic route (user bends dropped)', () => {
    // W30 cw2 (input cable) -> E1; give it a hand-made bend first
    const edited = run(world, moveBend(id(30), 0, { x: 300, y: 900 })).content
    expect(bends(edited, 30)).not.toEqual(bends(world, 30))
    const out = run(edited, setCableSides({ input: 'left' })).content
    const layout = computeLayout(out)
    expect(bends(out, 30)).toEqual(autoRouteFor(layout, wireOf(out, 30)))
    expect(endpointPoint(layout, cw(id(2)))).toEqual({ x: 300, y: 100 })
    expect(orthogonal(out)).toBe(true)
  })

  it('wires on the other kind stay as they were when only one kind moved (translated, not re-routed)', () => {
    // moving the inputs to the left shifts the rails by (+250, -250); W32 ends on an output cable wire
    const out = run(world, setCableSides({ input: 'left' })).content
    expect(bends(out, 31)).toEqual(bends(world, 31).map((b) => ({ x: b.x + 250, y: b.y - 250 })))
    expect(bends(out, 33)).toEqual(bends(world, 33).map((b) => ({ x: b.x + 250, y: b.y - 250 })))
    expect(orthogonal(out)).toBe(true)
  })

  it('an output-cable wire is re-routed when the output side changes, an input-cable wire is repaired', () => {
    const out = run(world, setCableSides({ output: 'right' })).content
    const layout = computeLayout(out)
    expect(bends(out, 32)).toEqual(autoRouteFor(layout, wireOf(out, 32)))
    expect(endpointDirection(layout, cw(id(5)))).toBe('left')
    expect(orthogonal(out)).toBe(true)
    // the input cable stayed on top: its rails did not move in x, only the bottom band changed
    expect(bends(out, 30)).toEqual(bends(world, 30))
  })

  it('both kinds changed: every wire stays attached and orthogonal', () => {
    for (const [input, output] of [
      ['right', 'left'],
      ['bottom', 'top'],
      ['left', 'left'],
    ] as const) {
      const out = run(world, setCableSides({ input, output })).content
      expect(out.wires.map((w) => [w.start, w.end])).toEqual(
        world.wires.map((w) => [w.start, w.end]),
      )
      expect(orthogonal(out)).toBe(true)
      expect(validateContent(out)).toEqual([])
    }
  })

  it('a wire between two cable wires of the moved kind is routed again', () => {
    const c = run(
      content({ inputCables: [inputCable(1, [2, 3])], rails: [rail(10, 24, 150)] }),
      addAuto(30, cw(id(2)), cw(id(3))),
    ).content
    const out = run(c, setCableSides({ input: 'bottom' })).content
    expect(bends(out, 30)).toEqual(autoRouteFor(computeLayout(out), wireOf(out, 30)))
    expect(orthogonal(out)).toBe(true)
  })
})

describe('setCableSides: errors', () => {
  it.each(['diagonal', '', 'TOP'] as const)('rejects the unknown side %j', (side) => {
    expect(rejection(setCableSides({ input: side as CableSide })(world))).toBe('invalid')
    expect(rejection(setCableSides({ output: side as CableSide })(world))).toBe('invalid')
  })

  /** The drawing is 998 750 u high; the rail pushes everything down. */
  const near = (output: CableSide) =>
    content({
      railWidthModules: 24,
      outputCableSide: output,
      outputCables: [outputCable(4, [5])],
      rails: [rail(10, 24, 99770, [element(20, 0, 2, 2)])],
    })

  it('rejects a change that would grow the drawing beyond the coordinate range', () => {
    const c = near('right')
    expect(computeLayout(c).height).toBeLessThanOrEqual(MAX_COORD_U)
    expect(setCableSides({ output: 'bottom' })(c)).toEqual({
      ok: false,
      reason: 'limit',
      detail: 'coordinates',
    })
    // the inputs already stand on top: sharing their row adds no height
    expect(rejection(setCableSides({ output: 'top' })(c))).toBeNull()
  })

  it('accepts a change that keeps the drawing inside the range', () => {
    const c = near('right')
    expect(rejection(setCableSides({ output: 'left' })(c))).toBeNull()
    expect(rejection(setCableSides({ input: 'left' })(c))).toBeNull()
  })

  it('a rejected change leaves the content as it was', () => {
    const c = near('right')
    const outcome = setCableSides({ output: 'bottom' })(c)
    expect(outcome.ok).toBe(false)
    expect(c.outputCableSide).toBe('right')
  })
})

describe('setCableSides in the editor store (one undoable command)', () => {
  let store: ReturnType<typeof usePanelEditorStore>

  beforeEach(async () => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false } as never
    auth.status = 'authenticated'
    const panel: Panel = {
      id: 'p1',
      name: 'Щит',
      version: 1,
      createdAt: '2026-01-01T00:00:00+00:00',
      updatedAt: '2026-01-01T00:00:00+00:00',
      deletedAt: null,
      content: world,
      shortCircuits: [],
    }
    vi.spyOn(panelsApi, 'get').mockResolvedValue(panel)
    store = usePanelEditorStore()
    await store.load('p1')
  })

  it('both kinds changed together are one history entry and one undo restores everything', () => {
    store.apply(
      setCableSides({ input: 'left', output: 'right' }),
      'editor.history.changeCableSides',
    )
    expect(store.content?.inputCableSide).toBe('left')
    expect(store.content?.outputCableSide).toBe('right')
    expect(store.dirty).toBe(true)
    expect(store.undo()).toBe('editor.history.changeCableSides')
    expect(store.content).toBe(world) // wires, routes and sides restored by reference
    expect(store.dirty).toBe(false)
    expect(store.canUndo).toBe(false)
  })

  it('redo applies the change again', () => {
    store.apply(setCableSides({ input: 'bottom' }), 'editor.history.changeCableSides')
    const changed = store.content
    store.undo()
    store.redo()
    expect(store.content).toBe(changed)
  })

  it('a no-op change records nothing', () => {
    store.apply(setCableSides({ input: 'top' }), 'editor.history.changeCableSides')
    expect(store.canUndo).toBe(false)
    expect(store.dirty).toBe(false)
  })

  it('a rejected change records nothing', () => {
    const outcome = store.apply(
      setCableSides({ input: 'nowhere' as CableSide }),
      'editor.history.changeCableSides',
    )
    expect(outcome.ok).toBe(false)
    expect(store.canUndo).toBe(false)
  })
})

describe('default cables have two wires: brown and blue', () => {
  it('defaultInputCable', () => {
    const cable = defaultInputCable(id(6), id(7), id(8))
    expect(cable.wires).toEqual([
      { id: id(7), colour: 'brown' },
      { id: id(8), colour: 'blue' },
    ])
    expect(cable).toMatchObject({ voltage: 230, frequency: 50, crossSection: 4, label: '' })
  })

  it('defaultOutputCable', () => {
    const cable = defaultOutputCable(id(6), id(7), id(8))
    expect(cable.wires.map((w) => w.colour)).toEqual(['brown', 'blue'])
    expect(cable).toMatchObject({ description: '', label: '' })
  })

  it('both are accepted by their add commands and the result is valid', () => {
    const c = content({ rails: [rail(10, 24, 150)] })
    const withInput = run(c, addInputCable(defaultInputCable(id(6), id(7), id(8)))).content
    const out = run(withInput, addOutputCable(defaultOutputCable(id(9), id(11), id(12)))).content
    expect(out.inputCables[1]?.wires).toHaveLength(2)
    expect(out.outputCables[0]?.wires).toHaveLength(2)
    expect(validateContent(out)).toEqual([])
  })

  it('wire ids must differ (a duplicated wire id is rejected)', () => {
    expect(rejection(addInputCable(defaultInputCable(id(6), id(7), id(7)))(content()))).toBe(
      'duplicateId',
    )
  })
})

describe('cable commands check the drawing range', () => {
  /** An output side with no cable takes no room; the first cable adds a band below the rails. */
  const nearEdge = () =>
    content({
      railWidthModules: 24,
      outputCableSide: 'bottom',
      outputCables: [],
      rails: [rail(10, 24, 99770, [element(20, 0, 2, 2)])],
    })

  it('adding the first output cable at the bottom is rejected when it would leave the range', () => {
    const c = nearEdge()
    expect(computeLayout(c).height).toBeLessThanOrEqual(MAX_COORD_U)
    expect(addOutputCable(outputCable(4, [5]))(c)).toEqual({
      ok: false,
      reason: 'limit',
      detail: 'coordinates',
    })
  })

  it('the same cable on a side that takes no height is accepted', () => {
    const c = { ...nearEdge(), outputCableSide: 'right' as const }
    expect(rejection(addOutputCable(outputCable(4, [5]))(c))).toBeNull()
  })

  it('a normal panel accepts cables and cable wires (control)', () => {
    expect(rejection(addOutputCable(outputCable(70, [71]))(world))).toBeNull()
    expect(rejection(addCableWire(id(1), { id: id(60), colour: 'red' })(world))).toBeNull()
    expect(rejection(addInputCable(inputCable(6, [7]))(world))).toBeNull()
  })
})

// the helpers import pole for typed endpoints in other specs; keep the import used
void pole

describe('setCableSides when no automatic route exists', () => {
  it('a wire on a moved cable whose other end does not exist gets no bends', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      wires: [{ ...panelWire(30, cw(id(2)), pole(id(99), 0, 'input'), [{ x: 300, y: 900 }]) }],
    })
    const out = run(c, setCableSides({ input: 'left' })).content
    expect(out.inputCableSide).toBe('left')
    expect(out.wires[0]?.bends).toEqual([])
  })

  it('the same wire is kept untouched when only the other kind moves', () => {
    const bends = [{ x: 300, y: 900 }]
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      wires: [panelWire(30, cw(id(2)), pole(id(99), 0, 'input'), bends)],
    })
    expect(run(c, setCableSides({ output: 'left' })).content.wires[0]?.bends).toEqual(bends)
  })
})
