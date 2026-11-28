/** `layoutVersion` and output-cable `load` in the panel payload: strict in, always sent out. */
import { describe, expect, it } from 'vitest'
import { buildWorld } from '@/domain/__tests__/helpers'
import { panelContentJson } from '@/test/http'
import { InvalidPayloadError, contentToPayload, normalizeContent } from '../panels'

const json = () => panelContentJson() as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- test payload mutation

describe('normalizeContent: layoutVersion', () => {
  it.each([1, 2] as const)('accepts %i', (v) => {
    const body = json()
    body.layoutVersion = v
    expect(normalizeContent(body as never).layoutVersion).toBe(v)
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['0', 0],
    ['3', 3],
    ['-1', -1],
    ['a fraction', 1.5],
    ['a string', '2'],
    ['NaN', NaN],
    ['true', true],
  ])('throws InvalidPayloadError for %s', (_n, value) => {
    const body = json()
    if (value === undefined) delete body.layoutVersion
    else body.layoutVersion = value
    expect(() => normalizeContent(body as never)).toThrow(InvalidPayloadError)
    expect(() => normalizeContent(body as never)).toThrow(/layoutVersion/)
  })
})

describe('normalizeContent: output cable load', () => {
  it.each(['socket', 'lighting'] as const)('accepts %s', (load) => {
    const body = json()
    body.outputCables[0].load = load
    expect(normalizeContent(body as never).outputCables[0]?.load).toBe(load)
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['an unknown value', 'lamp'],
    ['another case', 'Socket'],
    ['a number', 1],
  ])('throws InvalidPayloadError for %s', (_n, value) => {
    const body = json()
    if (value === undefined) delete body.outputCables[0].load
    else body.outputCables[0].load = value
    expect(() => normalizeContent(body as never)).toThrow(InvalidPayloadError)
    expect(() => normalizeContent(body as never)).toThrow(/output cable load/)
  })

  it('checks every output cable', () => {
    const body = json()
    body.outputCables.push({
      ...body.outputCables[0],
      id: 'o2',
      wires: [{ id: 'ow2', colour: 'black' }],
      load: 'lamp',
    })
    expect(() => normalizeContent(body as never)).toThrow(InvalidPayloadError)
  })
})

describe('contentToPayload', () => {
  it('always sends layoutVersion and the load of every output cable', () => {
    const world = buildWorld()
    const payload = contentToPayload(world)
    expect(payload.layoutVersion).toBe(2)
    expect(payload.outputCables?.map((o) => o.load)).toEqual(world.outputCables.map((o) => o.load))
  })

  it('sends layoutVersion 1 as it is (a save never lowers or invents a version)', () => {
    expect(contentToPayload({ ...buildWorld(), layoutVersion: 1 }).layoutVersion).toBe(1)
  })

  it('round-trips layoutVersion and load', () => {
    const world = {
      ...buildWorld(),
      outputCables: buildWorld().outputCables.map((o) => ({ ...o, load: 'lighting' as const })),
    }
    expect(normalizeContent(contentToPayload(world))).toEqual(world)
  })
})
