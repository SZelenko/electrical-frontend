// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { t } from '@/i18n'
import {
  cableWireLabel,
  colourName,
  describeShortCircuit,
  formatDateTime,
  formatInputCableLabel,
  panelWireLabel,
  type PanelContent,
} from '../panelContent'

const content: PanelContent = {
  railWidthModules: 12,
  inputCableSide: 'top',
  outputCableSide: 'bottom',
  terminalRow: [],
  bottomTerminalRow: [],
  inputCables: [
    {
      id: 'c1',
      label: '',
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
      label: '',
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
      spacingMm: 0,
      terminalBlocks: [],
      busbars: [],
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
    { id: 'r2', spacingMm: 10, terminalBlocks: [], elements: [], busbars: [] },
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

describe('colourName', () => {
  it.each([
    ['black', 'чорний'],
    ['brown', 'коричневий'],
    ['red', 'червоний'],
    ['blue', 'синій'],
    ['green-yellow', 'жовто-зелений'],
  ])('names %s', (colour, name) => expect(colourName(colour, t)).toBe(name))

  it('returns an unknown colour as is, including Object prototype keys', () => {
    expect(colourName('purple', t)).toBe('purple')
    expect(colourName('toString', t)).toBe('toString')
  })

  it.each(['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf'])(
    'does not resolve the prototype key %s to an inherited member',
    (key) => {
      expect(colourName(key, t)).toBe(key)
      expect(typeof colourName(key, t)).toBe('string')
    },
  )

  it('still resolves every own colour next to the prototype guard', () => {
    expect(colourName('green-yellow', t)).toBe('жовто-зелений')
  })
})

describe('formatting', () => {
  it('formats an input cable label', () => {
    expect(formatInputCableLabel({ voltage: 230, frequency: 50, crossSection: 1.5 }, t)).toBe(
      '230 В / 50 Гц / 1,5 мм²',
    )
  })

  it('formats a valid date and returns an invalid one unchanged', () => {
    expect(formatDateTime('2026-01-02T10:00:00+00:00', 'uk')).toMatch(/2026/)
    expect(formatDateTime('not a date', 'uk')).toBe('not a date')
  })
})

describe('labels and short circuits', () => {
  it('labels cable and panel wires, null when unknown', () => {
    expect(cableWireLabel(content, 'w2', t)).toBe('вхідний кабель 1, провід 2 (синій)')
    expect(cableWireLabel(content, 'w3', t)).toBe('вхідний кабель 2, провід 1 (червоний)')
    expect(cableWireLabel(content, 'zzz', t)).toBeNull()
    expect(panelWireLabel(content, 'pw2', t)).toBe('провід №2')
    expect(panelWireLabel(content, 'zzz', t)).toBeNull()
  })

  it('describes a short circuit group, falling back to raw ids', () => {
    expect(
      describeShortCircuit(content, { sources: ['w1', 'w3'], wireIds: ['pw1'], terminals: [] }, t),
    ).toEqual({
      sources: ['вхідний кабель 1, провід 1 (коричневий)', 'вхідний кабель 2, провід 1 (червоний)'],
      wires: ['провід №1'],
    })
    expect(
      describeShortCircuit(content, { sources: ['x'], wireIds: ['y'], terminals: [] }, t),
    ).toEqual({
      sources: ['x'],
      wires: ['y'],
    })
    expect(describeShortCircuit(content, { sources: [], wireIds: [], terminals: [] }, t)).toEqual({
      sources: [],
      wires: [],
    })
  })
})
