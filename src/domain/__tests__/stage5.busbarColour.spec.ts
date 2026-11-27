/** Stage 5 follow-up: busbar colour in commands, validation, geometry and default wire colours. */
import { describe, expect, it } from 'vitest'
import { updateBusbar } from '../commands'
import {
  CABLE_LABEL_INPUT_Y,
  CABLE_LABEL_INSET,
  CABLE_LABEL_OUTPUT_Y,
  computeLayout,
} from '../geometry'
import { WIRE_COLOURS } from '../limits'
import type { PanelContent, WireColour } from '../panelContent'
import { validateContent } from '../validateContent'
import { defaultWireColour } from '../wireDefaults'
import {
  block,
  busbar,
  content,
  cw,
  element,
  feed,
  id,
  inputCable,
  panelWire,
  rail,
  rejection,
  run,
} from './helpers'

const dev = (n: number, offset: number) => element(n, offset, 1, 2)
const world = (colour: WireColour | null = null): PanelContent =>
  content({
    railWidthModules: 24,
    inputCables: [inputCable(1, [2, 3])],
    rails: [
      rail(
        10,
        24,
        150,
        [dev(20, 0), dev(21, 1), dev(22, 2)],
        [],
        [{ ...busbar(60, 'LN', id(20), 3), colour }],
      ),
    ],
    wires: [panelWire(30, cw(id(2)), feed(id(60), 0))],
  })
const colourOf = (c: PanelContent) => c.rails[0]?.busbars[0]?.colour

describe('geometry: cable label constants', () => {
  it('match panel-domain', () => {
    expect([CABLE_LABEL_INPUT_Y, CABLE_LABEL_OUTPUT_Y, CABLE_LABEL_INSET]).toEqual([130, 140, 40])
  })
})

describe('updateBusbar colour', () => {
  it.each(WIRE_COLOURS.map((c): [WireColour] => [c]))('sets %s and stays valid', (colour) => {
    const out = run(world(), updateBusbar(id(60), { colour }))
    expect(colourOf(out.content)).toBe(colour)
    expect(out.removedWires).toBe(0)
    expect(validateContent(out.content)).toEqual([])
  })

  it('goes back to grey with null', () => {
    const out = run(world('red'), updateBusbar(id(60), { colour: null }))
    expect(colourOf(out.content)).toBeNull()
  })

  it('keeps type, count and the wires; the colour is the only change', () => {
    const w = world()
    const out = run(w, updateBusbar(id(60), { colour: 'blue' })).content
    expect(out.rails[0]?.busbars[0]).toEqual({ ...w.rails[0]!.busbars[0]!, colour: 'blue' })
    expect(out.wires).toEqual(w.wires)
  })

  it('is a no-op (same reference) when the colour does not change', () => {
    const w = world('red')
    expect(run(w, updateBusbar(id(60), { colour: 'red' })).content).toBe(w)
  })

  it('leaves the colour alone when it is not in the patch', () => {
    const out = run(world('red'), updateBusbar(id(60), { count: 2 }))
    expect(colourOf(out.content)).toBe('red')
  })

  it('is pure: the source keeps its colour', () => {
    const w = world()
    run(w, updateBusbar(id(60), { colour: 'red' }))
    expect(colourOf(w)).toBeNull()
  })

  it.each([
    ['an unknown colour', 'pink'],
    ['an empty string', ''],
    ['a number', 0],
  ])('rejects %s', (_n, bad) => {
    expect(rejection(updateBusbar(id(60), { colour: bad as never })(world()))).toBe('invalid')
  })

  it('rejects an unknown busbar', () => {
    expect(rejection(updateBusbar(id(99), { colour: 'red' })(world()))).not.toBeNull()
  })
})

describe('validateContent: busbar colour', () => {
  const withColour = (colour: unknown): PanelContent => world(colour as WireColour)

  it.each<[WireColour | null]>([[null], ...WIRE_COLOURS.map((c): [WireColour] => [c])])(
    'accepts %s',
    (colour) => {
      expect(validateContent(withColour(colour))).toEqual([])
    },
  )

  it.each([['pink'], [''], [0]])('rejects %j with the backend path and message', (c) => {
    expect(validateContent(withColour(c)).map((v) => [v.propertyPath, v.message])).toEqual([
      ['content.rails[0].busbars[0].colour', 'Must be one of the wire colours or null.'],
    ])
  })

  it('uses the same message as the terminal block colour', () => {
    const bad = content({
      rails: [rail(10, 24, 150, [], [{ ...block(40, 0, 1, 2), colour: 'pink' as never }])],
    })
    expect(validateContent(bad).map((v) => v.message)).toContain(
      'Must be one of the wire colours or null.',
    )
  })
})

describe('default wire colour is independent of the busbar colour', () => {
  it.each<[string, WireColour | null]>([
    ['grey', null],
    ['red', 'red'],
    ['green-yellow', 'green-yellow'],
  ])('feeds of a %s busbar: L brown, N blue', (_n, colour) => {
    const c = world(colour)
    expect(defaultWireColour(c, feed(id(60), 0), 'black')).toBe('brown')
    expect(defaultWireColour(c, feed(id(60), 1), 'black')).toBe('blue')
  })

  it('a coloured busbar does not change the colour taken from a cable wire start', () => {
    expect(defaultWireColour(world('red'), cw(id(2)), 'black')).toBe('brown')
  })

  it('layout carries the busbar colour', () => {
    expect(computeLayout(world('red')).busbars.get(id(60))?.colour).toBe('red')
    expect(computeLayout(world()).busbars.get(id(60))?.colour).toBeNull()
  })
})
