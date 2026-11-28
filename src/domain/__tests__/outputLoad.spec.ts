/** Output load (socket / lighting): command, default, validation and the range check of the rail width. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { panelsApi } from '@/api/panels'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'
import {
  addOutputCable,
  defaultOutputCable,
  setOutputLoad,
  setRailWidth,
  updateOutputCable,
} from '../commands'
import type { OutputLoad, PanelContent } from '../panelContent'
import { validateContent } from '../validateContent'
import {
  buildWorld,
  content,
  id,
  inputCable,
  outputCable,
  panelWire,
  rail,
  rejection,
  run,
} from './helpers'

const world = buildWorld() // output cable id(4), load socket
const loadOf = (c: PanelContent, n = 4) => c.outputCables.find((o) => o.id === id(n))?.load

describe('setOutputLoad', () => {
  it('sets lighting and back to socket', () => {
    const lit = run(world, setOutputLoad(id(4), 'lighting')).content
    expect(loadOf(lit)).toBe('lighting')
    expect(loadOf(run(lit, setOutputLoad(id(4), 'socket')).content)).toBe('socket')
  })

  it('changes only that cable (structural sharing) and leaves the layout alone', () => {
    const two = content({ outputCables: [outputCable(4, [5]), outputCable(6, [7])] })
    const next = run(two, setOutputLoad(id(6), 'lighting')).content
    expect(next.outputCables[0]).toBe(two.outputCables[0])
    expect(next.inputCables).toBe(two.inputCables)
    expect(next.rails).toBe(two.rails)
    expect(next.wires).toBe(two.wires)
  })

  it('the same value is a no-op returning the same content', () => {
    expect(setOutputLoad(id(4), 'socket')(world)).toMatchObject({ ok: true })
    expect(run(world, setOutputLoad(id(4), 'socket')).content).toBe(world)
  })

  it('does not move any wire', () => {
    expect(run(world, setOutputLoad(id(4), 'lighting')).content.wires).toBe(world.wires)
  })

  it('rejects an unknown cable id', () => {
    expect(rejection(setOutputLoad(id(99), 'lighting')(world))).toBe('notFound')
  })

  it('rejects the id of an input cable', () => {
    expect(rejection(setOutputLoad(id(1), 'lighting')(world))).toBe('notFound')
  })

  it.each(['', 'LIGHTING', 'lamp', 'socket '])('rejects the invalid load %j', (bad) => {
    expect(rejection(setOutputLoad(id(4), bad as OutputLoad)(world))).toBe('invalid')
  })
})

describe('setOutputLoad in the editor history', () => {
  let store: ReturnType<typeof usePanelEditorStore>
  beforeEach(async () => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false } as never
    auth.status = 'authenticated'
    store = usePanelEditorStore()
    vi.spyOn(panelsApi, 'get').mockResolvedValue({
      id: 'p1',
      name: 'n',
      version: 1,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      content: world,
      shortCircuits: [],
    })
    await store.load('p1')
  })

  it('is one undo step; undo and redo swap references exactly', () => {
    expect(
      store.apply(setOutputLoad(id(4), 'lighting'), 'editor.history.changeOutputLoad').ok,
    ).toBe(true)
    const after = store.content
    expect(loadOf(after!)).toBe('lighting')
    expect(store.dirty).toBe(true)
    expect(store.undo()).toBe('editor.history.changeOutputLoad')
    expect(store.content).toBe(world)
    expect(store.dirty).toBe(false)
    expect(store.redo()).toBe('editor.history.changeOutputLoad')
    expect(store.content).toBe(after)
    expect(store.canUndo).toBe(true)
  })

  it('a no-op or rejected command adds no history entry', () => {
    store.apply(setOutputLoad(id(4), 'socket'), 'editor.history.changeOutputLoad')
    expect(store.canUndo).toBe(false)
    expect(
      store.apply(setOutputLoad(id(99), 'lighting'), 'editor.history.changeOutputLoad'),
    ).toEqual({ ok: false, reason: 'notFound', detail: id(99) })
    expect(store.canUndo).toBe(false)
  })
})

describe('a new output cable defaults to socket', () => {
  it('defaultOutputCable', () => {
    expect(defaultOutputCable(id(7), id(8), id(9)).load).toBe('socket')
  })

  it('addOutputCable accepts both loads', () => {
    for (const load of ['socket', 'lighting'] as const) {
      const c = run(content(), addOutputCable({ ...outputCable(7, [8]), load })).content
      expect(loadOf(c, 7)).toBe(load)
    }
  })

  it('addOutputCable rejects an invalid load', () => {
    const bad = { ...outputCable(7, [8]), load: 'x' as OutputLoad }
    expect(rejection(addOutputCable(bad)(content()))).toBe('invalid')
  })

  it('updating the description keeps the load', () => {
    const lit = run(world, setOutputLoad(id(4), 'lighting')).content
    const next = run(lit, updateOutputCable(id(4), { description: 'Світло' })).content
    expect(loadOf(next)).toBe('lighting')
  })
})

describe('setRailWidth checks the drawing range', () => {
  /** 100 four-wire outputs on top: a 60-module span wraps to 4 lines, a 1-module span to 100. */
  const tall = () =>
    content({
      railWidthModules: 60,
      inputCableSide: 'left',
      outputCableSide: 'top',
      inputCables: [inputCable(1, [2])],
      outputCables: Array.from({ length: 100 }, (_, i) =>
        outputCable(
          100 + i,
          Array.from({ length: 4 }, (_, w) => 1000 + i * 10 + w),
        ),
      ),
      rails: [rail(10, 1, 99000)],
    })

  it('accepts the width while the drawing stays in range', () => {
    expect(run(tall(), setRailWidth(30)).content.railWidthModules).toBe(30)
  })

  it('rejects a narrower rail whose wrapped output lines push the drawing out of range', () => {
    expect(rejection(setRailWidth(1)(tall()))).toBe('limit')
  })
})

describe('validateContent: layoutVersion and load', () => {
  const at = (c: PanelContent) => validateContent(c)

  it.each([1, 2] as const)('accepts layoutVersion %i', (v) => {
    expect(at({ ...world, layoutVersion: v })).toEqual([])
  })

  it.each([0, 3, -1, 100])('layoutVersion %i is value.out_of_range {min 1, max 2}', (v) => {
    const out = at({ ...world, layoutVersion: v as 1 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      propertyPath: 'content.layoutVersion',
      code: 'value.out_of_range',
      parameters: { min: 1, max: 2 },
    })
  })

  it.each([1.5, NaN, Infinity])('layoutVersion %s is value.invalid_type', (v) => {
    const out = at({ ...world, layoutVersion: v as 1 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      propertyPath: 'content.layoutVersion',
      code: 'value.invalid_type',
    })
  })

  it.each([undefined, null, '2'])('layoutVersion %j is value.invalid_type', (v) => {
    const out = at({ ...world, layoutVersion: v as never })
    expect(out.map((x) => [x.propertyPath, x.code])).toEqual([
      ['content.layoutVersion', 'value.invalid_type'],
    ])
  })

  it.each(['socket', 'lighting'] as const)('accepts load %s', (load) => {
    const c = { ...world, outputCables: world.outputCables.map((o) => ({ ...o, load })) }
    expect(at(c)).toEqual([])
  })

  it.each([undefined, null, '', 'lamp', 'Socket', 1])('load %j is value.invalid_type', (load) => {
    const c = {
      ...world,
      outputCables: world.outputCables.map((o) => ({ ...o, load: load as never })),
    }
    const out = at(c)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ code: 'value.invalid_type', parameters: {} })
    expect(out[0]?.propertyPath).toMatch(/outputCables\[0\]\.load$/)
  })

  it('reports the load of every offending cable', () => {
    const c = content({
      outputCables: [
        { ...outputCable(4, [5]), load: 'x' as OutputLoad },
        outputCable(6, [7]),
        { ...outputCable(8, [9]), load: null as never },
      ],
      wires: [
        panelWire(
          30,
          { kind: 'cableWire', cableWireId: id(5) },
          { kind: 'cableWire', cableWireId: id(7) },
        ),
      ],
    })
    const paths = at(c)
      .filter((v) => v.code === 'value.invalid_type')
      .map((v) => v.propertyPath)
    expect(paths).toHaveLength(2)
    expect(paths[0]).toMatch(/\[0\]\.load$/)
    expect(paths[1]).toMatch(/\[2\]\.load$/)
  })
})
