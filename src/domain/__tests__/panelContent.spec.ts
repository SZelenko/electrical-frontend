// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  cableWireLabel,
  colourName,
  describeShortCircuit,
  formatDateTime,
  formatInputCableLabel,
  panelWireLabel,
  pluralUk,
  type PanelContent,
} from '../panelContent'

const content: PanelContent = {
  terminalRow: [],
  inputCables: [
    {
      id: 'c1',
      voltage: 230,
      frequency: 50,
      crossSection: 4,
      wires: [
        { id: 'w1', colour: 'brown' },
        { id: 'w2', colour: 'blue' },
      ],
    },
    {
      id: 'c2',
      voltage: 400,
      frequency: 50,
      crossSection: 1.5,
      wires: [{ id: 'w3', colour: 'red' }],
    },
  ],
  outputCables: [],
  rails: [
    {
      id: 'r1',
      widthModules: 12,
      spacingMm: 0,
      terminalBlocks: [],
      elements: [
        {
          kind: 'device' as const,
          style: 'breaker' as const,
          state: null,
          id: 'e1',
          offsetModules: 0,
          widthModules: 1,
          label: '',
          marking: '',
          on: true,
          sidesSwapped: false,
          poles: [{ transit: false }],
        },
        {
          kind: 'device' as const,
          style: 'breaker' as const,
          state: null,
          id: 'e2',
          offsetModules: 1,
          widthModules: 1,
          label: '',
          marking: '',
          on: true,
          sidesSwapped: false,
          poles: [{ transit: false }],
        },
      ],
    },
    { id: 'r2', widthModules: 12, spacingMm: 10, terminalBlocks: [], elements: [] },
  ],
  wires: [
    {
      id: 'pw1',
      colour: 'brown',
      crossSection: '2.5',
      start: { kind: 'cableWire', cableWireId: 'w1' },
      end: { kind: 'pole', elementId: 'e1', poleIndex: 0, side: 'input' },
      bends: [],
    },
    {
      id: 'pw2',
      colour: 'blue',
      crossSection: '1.5',
      start: { kind: 'cableWire', cableWireId: 'w2' },
      end: { kind: 'terminal', terminalBlockId: 'tb', terminalIndex: 1, contactSide: 'left' },
      bends: [],
    },
  ],
}

describe('pluralUk', () => {
  it.each([
    [0, 'many'],
    [1, 'one'],
    [2, 'few'],
    [4, 'few'],
    [5, 'many'],
    [10, 'many'],
    [11, 'many'],
    [12, 'many'],
    [14, 'many'],
    [15, 'many'],
    [21, 'one'],
    [22, 'few'],
    [25, 'many'],
    [101, 'one'],
    [111, 'many'],
    [112, 'many'],
    [122, 'few'],
    [-1, 'one'],
    [-3, 'few'],
  ])('%i -> %s', (n, form) => {
    const forms = { one: 'провід', few: 'проводи', many: 'проводів' }
    expect(pluralUk(n, forms.one, forms.few, forms.many)).toBe(forms[form as keyof typeof forms])
  })
})

describe('colourName', () => {
  it.each([
    ['black', 'чорний'],
    ['brown', 'коричневий'],
    ['red', 'червоний'],
    ['blue', 'синій'],
    ['green-yellow', 'жовто-зелений'],
  ])('names %s', (colour, name) => expect(colourName(colour)).toBe(name))

  it('returns an unknown colour as is, including Object prototype keys', () => {
    expect(colourName('purple')).toBe('purple')
    expect(colourName('toString')).toBe('toString')
  })

  it.each(['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf'])(
    'does not resolve the prototype key %s to an inherited member',
    (key) => {
      expect(colourName(key)).toBe(key)
      expect(typeof colourName(key)).toBe('string')
    },
  )

  it('still resolves every own colour next to the prototype guard', () => {
    expect(colourName('green-yellow')).toBe('жовто-зелений')
  })
})

describe('formatting', () => {
  it('formats an input cable label', () => {
    expect(formatInputCableLabel({ voltage: 230, frequency: 50, crossSection: 1.5 })).toBe(
      '230 V / 50 Hz / 1.5 mm²',
    )
  })

  it('formats a valid date and returns an invalid one unchanged', () => {
    expect(formatDateTime('2026-01-02T10:00:00+00:00')).toMatch(/2026/)
    expect(formatDateTime('not a date')).toBe('not a date')
  })
})

describe('labels and short circuits', () => {
  it('labels cable and panel wires, null when unknown', () => {
    expect(cableWireLabel(content, 'w2')).toBe('вхідний кабель 1, провід 2 (синій)')
    expect(cableWireLabel(content, 'w3')).toBe('вхідний кабель 2, провід 1 (червоний)')
    expect(cableWireLabel(content, 'zzz')).toBeNull()
    expect(panelWireLabel(content, 'pw2')).toBe('провід №2')
    expect(panelWireLabel(content, 'zzz')).toBeNull()
  })

  it('describes a short circuit group, falling back to raw ids', () => {
    expect(
      describeShortCircuit(content, { sources: ['w1', 'w3'], wireIds: ['pw1'], terminals: [] }),
    ).toEqual({
      sources: ['вхідний кабель 1, провід 1 (коричневий)', 'вхідний кабель 2, провід 1 (червоний)'],
      wires: ['провід №1'],
    })
    expect(
      describeShortCircuit(content, { sources: ['x'], wireIds: ['y'], terminals: [] }),
    ).toEqual({
      sources: ['x'],
      wires: ['y'],
    })
    expect(describeShortCircuit(content, { sources: [], wireIds: [], terminals: [] })).toEqual({
      sources: [],
      wires: [],
    })
  })
})
