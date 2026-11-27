/** Busbar colour in the API payload: required key, nullable, round trip. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWorld, busbar, id } from '@/domain/__tests__/helpers'
import { panelContentJson } from '@/test/http'
import { InvalidPayloadError, contentToPayload, normalizeContent } from '../panels'

beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1'))
afterEach(() => vi.unstubAllEnvs())

const withBusbar = (colour: unknown) => {
  const json = panelContentJson()
  ;(json.rails[0]!.busbars as unknown[]).push({
    id: 'b1',
    type: 'L',
    colour,
    firstElementId: 'e1',
    count: 2,
  })
  return json
}

describe('busbar colour payload', () => {
  it.each([[null], ['black'], ['brown'], ['red'], ['blue'], ['green-yellow']])(
    'reads colour %j',
    (colour) => {
      const out = normalizeContent(withBusbar(colour) as never)
      expect(out.rails[0]?.busbars[0]?.colour).toBe(colour)
    },
  )

  it('throws InvalidPayloadError when the colour key is missing', () => {
    const json = withBusbar(null) as { rails: { busbars: Record<string, unknown>[] }[] }
    delete json.rails[0]!.busbars[0]!.colour
    expect(() => normalizeContent(json as never)).toThrow(InvalidPayloadError)
  })

  it('sends the colour (null stays null, a colour stays a colour)', () => {
    const c = structuredClone(buildWorld())
    c.rails[0]!.busbars = [
      { ...busbar(60, 'L', id(20), 2), colour: null },
      { ...busbar(61, 'LN', id(21), 2), colour: 'green-yellow' },
    ]
    const sent = contentToPayload(c).rails?.[0]?.busbars
    expect(sent?.map((b) => b.colour)).toEqual([null, 'green-yellow'])
    expect(sent?.every((b) => 'colour' in b)).toBe(true)
  })

  it('round trips payload -> model -> payload', () => {
    const model = normalizeContent(withBusbar('blue') as never)
    expect(contentToPayload(model).rails?.[0]?.busbars?.[0]).toEqual({
      id: 'b1',
      type: 'L',
      colour: 'blue',
      firstElementId: 'e1',
      count: 2,
    })
  })
})
