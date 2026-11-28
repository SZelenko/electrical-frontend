/** Cable sides and the bottom terminal row in the API payload: required keys, validated values, round trip. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWorld, content, id, rowBlock } from '@/domain/__tests__/helpers'
import { CABLE_SIDES } from '@/domain/panelContent'
import { panelContentJson } from '@/test/http'
import { InvalidPayloadError, contentToPayload, normalizeContent } from '../panels'

beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1'))
afterEach(() => vi.unstubAllEnvs())

type Json = ReturnType<typeof panelContentJson> & Record<string, unknown>
const json = (over: Record<string, unknown> = {}): Json =>
  ({ ...panelContentJson(), ...over }) as Json

describe('cable sides: reading', () => {
  it.each(CABLE_SIDES.flatMap((i) => CABLE_SIDES.map((o) => [i, o] as const)))(
    'reads inputs %s and outputs %s',
    (input, output) => {
      const out = normalizeContent(
        json({ inputCableSide: input, outputCableSide: output }) as never,
      )
      expect(out.inputCableSide).toBe(input)
      expect(out.outputCableSide).toBe(output)
    },
  )

  it.each(['inputCableSide', 'outputCableSide'])(
    'throws InvalidPayloadError when %s is missing',
    (key) => {
      const body = json()
      delete body[key]
      expect(() => normalizeContent(body as never)).toThrow(InvalidPayloadError)
      expect(() => normalizeContent(body as never)).toThrow(key)
    },
  )

  it.each([
    ['null', null],
    ['an unknown word', 'diagonal'],
    ['the wrong case', 'TOP'],
    ['an empty string', ''],
    ['a number', 1],
    ['an object', { side: 'top' }],
  ])('throws InvalidPayloadError for %s on inputCableSide', (_n, value) => {
    expect(() => normalizeContent(json({ inputCableSide: value }) as never)).toThrow(
      InvalidPayloadError,
    )
  })

  it.each([['diagonal'], [null], [undefined]])(
    'throws InvalidPayloadError for %j on outputCableSide',
    (value) => {
      expect(() => normalizeContent(json({ outputCableSide: value }) as never)).toThrow(
        InvalidPayloadError,
      )
    },
  )
})

describe('bottom terminal row: reading', () => {
  it('reads the blocks of both rows separately', () => {
    const body = json({
      terminalRow: [
        { id: 'tt', offsetModules: 0, widthModules: 1, terminalCount: 2, colour: null, label: 'A' },
      ],
      bottomTerminalRow: [
        {
          id: 'bb',
          offsetModules: 5,
          widthModules: 2,
          terminalCount: 4,
          colour: 'red',
          label: 'B',
        },
      ],
    })
    const out = normalizeContent(body as never)
    expect(out.terminalRow.map((b) => b.id)).toEqual(['tt'])
    expect(out.bottomTerminalRow).toEqual([
      { id: 'bb', offsetModules: 5, widthModules: 2, terminalCount: 4, colour: 'red', label: 'B' },
    ])
  })

  it('accepts an empty bottom row', () => {
    expect(normalizeContent(json({ bottomTerminalRow: [] }) as never).bottomTerminalRow).toEqual([])
  })

  it('throws InvalidPayloadError when bottomTerminalRow is missing or not a list', () => {
    const body: Record<string, unknown> = json()
    delete body.bottomTerminalRow
    expect(() => normalizeContent(body as never)).toThrow(InvalidPayloadError)
    expect(() => normalizeContent(json({ bottomTerminalRow: null }) as never)).toThrow(
      InvalidPayloadError,
    )
  })

  it('a bottom-row block with a missing field is an invalid payload', () => {
    const body = json({ bottomTerminalRow: [{ id: 'bb', offsetModules: 5 }] })
    expect(() => normalizeContent(body as never)).toThrow(InvalidPayloadError)
  })
})

describe('sides and rows: writing and round trip', () => {
  it('sends both sides and both rows', () => {
    const c = {
      ...content({
        inputCableSide: 'left',
        outputCableSide: 'right',
        terminalRow: [rowBlock(50, 0, 2)],
        bottomTerminalRow: [rowBlock(51, 3, 4)],
      }),
    }
    const sent = contentToPayload(c)
    expect(sent.inputCableSide).toBe('left')
    expect(sent.outputCableSide).toBe('right')
    expect(sent.terminalRow?.map((b) => b.id)).toEqual([id(50)])
    expect(sent.bottomTerminalRow?.map((b) => [b.id, b.offsetModules, b.widthModules])).toEqual([
      [id(51), 3, 2],
    ])
  })

  it('an empty bottom row is sent as an empty list, not omitted', () => {
    const sent = contentToPayload(content())
    expect('bottomTerminalRow' in sent).toBe(true)
    expect(sent.bottomTerminalRow).toEqual([])
  })

  it('does not alias the editor rows', () => {
    const c = content({ bottomTerminalRow: [rowBlock(51, 3, 4)] })
    const sent = contentToPayload(c)
    expect(sent.bottomTerminalRow?.[0]).not.toBe(c.bottomTerminalRow[0])
  })

  it('editor -> payload -> editor keeps sides and both rows', () => {
    const c = content({
      inputCableSide: 'bottom',
      outputCableSide: 'top',
      terminalRow: [rowBlock(50, 1, 2)],
      bottomTerminalRow: [rowBlock(51, 3, 4), rowBlock(52, 10, 1)],
    })
    expect(normalizeContent(contentToPayload(c))).toEqual(c)
  })

  it('payload -> editor -> payload keeps a bottom-row payload unchanged', () => {
    const body = json({
      inputCableSide: 'right',
      outputCableSide: 'left',
      bottomTerminalRow: [
        { id: 'bb', offsetModules: 5, widthModules: 2, terminalCount: 4, colour: null, label: '' },
      ],
    })
    const sent = contentToPayload(normalizeContent(body as never))
    expect(sent.inputCableSide).toBe('right')
    expect(sent.outputCableSide).toBe('left')
    expect(sent.bottomTerminalRow).toEqual(body.bottomTerminalRow)
  })

  it('the whole world survives the round trip with its default sides', () => {
    const world = structuredClone(buildWorld())
    const back = normalizeContent(contentToPayload(world))
    expect(back.inputCableSide).toBe('top')
    expect(back.outputCableSide).toBe('bottom')
    expect(back).toEqual(world)
  })
})
