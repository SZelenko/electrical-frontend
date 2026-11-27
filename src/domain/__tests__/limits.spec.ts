import { describe, expect, it } from 'vitest'
import {
  CABLE_CROSS_SECTION_RULE,
  FREQUENCY_RULE,
  MAX_BENDS_PER_WIRE,
  MAX_CABLE_WIRES,
  MAX_COORD_U,
  MAX_DESCRIPTION_LENGTH,
  MAX_INPUT_CABLES,
  MAX_LABEL_LENGTH,
  MAX_MARKING_LENGTH,
  MAX_OUTPUT_CABLES,
  MAX_POLES_PER_MODULE,
  MAX_RAIL_WIDTH,
  MAX_RAILS,
  MAX_TERMINALS_PER_MODULE,
  MAX_TOTAL_BENDS,
  MAX_WIRES,
  MIN_CABLE_WIRES,
  SPACING_RULE,
  VOLTAGE_RULE,
  WIRE_COLOURS,
  WIRE_CROSS_SECTIONS,
  checkDecimal,
  codePointLength,
  hasAtMostDecimals,
  isValidId,
  maxPolesForWidth,
  minWidthForPoles,
  rowBlockWidth,
} from '../limits'

describe('limits mirror the backend PanelContentValidator constants', () => {
  it.each([
    ['MAX_INPUT_CABLES', MAX_INPUT_CABLES, 20],
    ['MAX_OUTPUT_CABLES', MAX_OUTPUT_CABLES, 100],
    ['MAX_RAILS', MAX_RAILS, 8],
    ['MAX_WIRES', MAX_WIRES, 5000],
    ['MAX_BENDS_PER_WIRE', MAX_BENDS_PER_WIRE, 50],
    ['MAX_TOTAL_BENDS', MAX_TOTAL_BENDS, 20000],
    ['MIN_CABLE_WIRES', MIN_CABLE_WIRES, 1],
    ['MAX_CABLE_WIRES', MAX_CABLE_WIRES, 4],
    ['MAX_RAIL_WIDTH', MAX_RAIL_WIDTH, 60],
    ['MAX_POLES_PER_MODULE', MAX_POLES_PER_MODULE, 4],
    ['MAX_TERMINALS_PER_MODULE', MAX_TERMINALS_PER_MODULE, 2],
    ['MAX_LABEL_LENGTH', MAX_LABEL_LENGTH, 16],
    ['MAX_MARKING_LENGTH', MAX_MARKING_LENGTH, 6],
    ['MAX_DESCRIPTION_LENGTH', MAX_DESCRIPTION_LENGTH, 255],
    ['MAX_COORD_U (99999.9 mm in tenths)', MAX_COORD_U, 999999],
  ])('%s = %i', (_n, actual, expected) => expect(actual).toBe(expected))

  it('colour and cross-section sets are the allowed ones', () => {
    expect([...WIRE_COLOURS]).toEqual(['black', 'brown', 'red', 'blue', 'green-yellow'])
    expect([...WIRE_CROSS_SECTIONS]).toEqual(['1', '1.5', '2.5', '4', '6'])
  })

  it('decimal rules carry the backend scales', () => {
    expect(
      [VOLTAGE_RULE, FREQUENCY_RULE, CABLE_CROSS_SECTION_RULE, SPACING_RULE].map((r) => r.scale),
    ).toEqual([1, 2, 2, 1])
  })
})

describe('isValidId', () => {
  it.each([
    ['00000000-0000-4000-8000-000000000001', true],
    ['123e4567-e89b-12d3-a456-426614174000', true], // version 1
    ['123e4567-e89b-82d3-a456-426614174000', true], // version 8
    ['123E4567-E89B-12D3-A456-426614174000', false], // uppercase
    ['123e4567-e89b-02d3-a456-426614174000', false], // version 0
    ['123e4567-e89b-92d3-a456-426614174000', false], // version 9
    ['123e4567-e89b-12d3-c456-426614174000', false], // variant c
    ['123e4567-e89b-12d3-a456-42661417400', false], // too short
    ['123e4567-e89b-12d3-a456-4266141740000', false], // too long
    ['123e4567e89b12d3a456426614174000', false], // no dashes
    ['', false],
    ['not-a-uuid', false],
    [' 123e4567-e89b-12d3-a456-426614174000', false],
  ])('%j -> %s', (value, ok) => expect(isValidId(value)).toBe(ok))
})

describe('codePointLength counts Unicode code points', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['Автомат', 7],
    ['😀', 1], // 2 UTF-16 units
    ['😀😀😀', 3],
    ['a😀b', 3],
    ['é', 2], // combining mark counts as a code point
  ])('%j -> %i', (text, n) => expect(codePointLength(text)).toBe(n))
})

describe('width / count derivations', () => {
  it.each([
    [1, 4],
    [2, 8],
    [60, 240],
    [61, 240], // clamped at the rail width, like the backend
    [0, 1], // never below 1
  ])('width %i -> at most %i poles', (w, poles) => {
    expect(maxPolesForWidth(w)).toBe(poles)
  })

  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [9, 3],
    [0, 1],
  ])('%i poles need at least %i modules', (poles, w) => expect(minWidthForPoles(poles)).toBe(w))

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [60, 30],
    [0, 1],
  ])('a row block with %i contacts is %i modules wide', (n, w) => expect(rowBlockWidth(n)).toBe(w))
})

describe('hasAtMostDecimals', () => {
  it.each([
    [1, 0, true],
    [1.5, 0, false],
    [1.5, 1, true],
    [1.25, 1, false],
    [1.25, 2, true],
    [0.1 + 0.2, 1, true], // float noise
    [230, 1, true],
    [1.001, 2, false],
  ])('%d with scale %i -> %s', (v, scale, ok) => expect(hasAtMostDecimals(v, scale)).toBe(ok))
})

describe('checkDecimal (messages are non-null exactly when the backend rejects)', () => {
  const ok = (value: number, rule: Parameters<typeof checkDecimal>[1]) =>
    checkDecimal(value, rule) === null

  it.each([
    [230, true],
    [0.1, true],
    [99999.9, true],
    [0, false], // exclusive minimum
    [-1, false],
    [100000, false],
    [230.05, false], // scale 1
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])('voltage %d -> accepted %s', (v, accepted) => expect(ok(v, VOLTAGE_RULE)).toBe(accepted))

  it.each([
    [50, true],
    [0, true], // inclusive minimum
    [50.25, true],
    [999.99, true],
    [50.255, false],
    [1000, false],
    [-0.01, false],
  ])('frequency %d -> accepted %s', (v, accepted) => expect(ok(v, FREQUENCY_RULE)).toBe(accepted))

  it.each([
    [4, true],
    [0.01, true],
    [999.99, true],
    [0, false],
    [4.001, false],
    [1000, false],
  ])('cable cross-section %d -> accepted %s', (v, accepted) =>
    expect(ok(v, CABLE_CROSS_SECTION_RULE)).toBe(accepted),
  )

  it.each([
    [150, true],
    [0, true],
    [150.5, true],
    [99999.9, true],
    [150.55, false],
    [-0.1, false],
    [100000, false],
  ])('spacing %d -> accepted %s', (v, accepted) => expect(ok(v, SPACING_RULE)).toBe(accepted))

  it('returns a message mentioning the decimal places for a scale violation', () => {
    expect(checkDecimal(230.05, VOLTAGE_RULE)).toContain('1 decimal')
  })
})
