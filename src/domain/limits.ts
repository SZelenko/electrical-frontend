/** Limits mirroring the backend PanelContentValidator and entity constants (the backend is the source of truth). */
import type { DeviceStyle, WireColour, WireCrossSection } from './panelContent'

export const MAX_INPUT_CABLES = 20
export const MAX_OUTPUT_CABLES = 100
export const MAX_RAILS = 8
export const MAX_WIRES = 5000
export const MAX_BENDS_PER_WIRE = 50
export const MAX_TOTAL_BENDS = 20000
export const MIN_CABLE_WIRES = 1
export const MAX_CABLE_WIRES = 4
export const MAX_RAIL_WIDTH = 60
export const MAX_POLES_PER_MODULE = 4
/** Row blocks: contacts per module of width (width = ceil(contacts / 2)). */
export const MAX_TERMINALS_PER_MODULE = 2
export const ROW_WIDTH_MODULES = 60
export const MAX_ROW_BLOCKS = 60
export const MAX_ROW_BLOCK_TERMINALS = 60
export const MAX_RAIL_BLOCK_TERMINALS = 12
export const ATS_MIN_WIDTH = 2
export const ATS_INPUTS = 4
export const ATS_OUTPUTS = 2
export const MAX_LABEL_LENGTH = 16
export const MAX_MARKING_LENGTH = 6
export const MAX_DESCRIPTION_LENGTH = 255

export const MAX_VOLTAGE = 99999.9
export const MAX_FREQUENCY = 999.99
export const MAX_CABLE_CROSS_SECTION = 999.99
export const MAX_SPACING_MM = 99999.9
export const SCALE_VOLTAGE = 1
export const SCALE_FREQUENCY = 2
export const SCALE_CABLE_CROSS_SECTION = 2
export const SCALE_SPACING = 1
/** Bend coordinate limit in tenths of a millimetre (99999.9 mm). */
export const MAX_COORD_U = 999999

export const DEFAULT_VOLTAGE = 230
export const DEFAULT_FREQUENCY = 50
export const DEFAULT_CABLE_CROSS_SECTION = 4
export const DEFAULT_RAIL_SPACING_MM = 150

export const DEVICE_STYLES: readonly DeviceStyle[] = ['breaker', 'rcd', 'voltageRelay']
export const WIRE_COLOURS: readonly WireColour[] = ['black', 'brown', 'red', 'blue', 'green-yellow']
/** Terminal-block colours: grey (`null`) or a wire colour. */
export const BLOCK_COLOURS: readonly (WireColour | null)[] = [null, ...WIRE_COLOURS]
export const WIRE_CROSS_SECTIONS: readonly WireCrossSection[] = ['1', '1.5', '2.5', '4', '6']

/** Lowercase RFC 4122 UUID, as the backend accepts it. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export function isValidId(id: string): boolean {
  return UUID_PATTERN.test(id)
}

/** Text limits count Unicode code points, not UTF-16 units. */
export function codePointLength(text: string): number {
  return [...text].length
}

export function maxPolesForWidth(widthModules: number): number {
  return Math.max(1, Math.min(widthModules, MAX_RAIL_WIDTH) * MAX_POLES_PER_MODULE)
}
export function minWidthForPoles(poleCount: number): number {
  return Math.max(1, Math.ceil(poleCount / MAX_POLES_PER_MODULE))
}
/** Width of a terminal-row block: exactly `ceil(contacts / 2)` modules. */
export function rowBlockWidth(terminalCount: number): number {
  return Math.max(1, Math.ceil(terminalCount / MAX_TERMINALS_PER_MODULE))
}

/** Rounds to `scale` decimal places (the value the backend stores). */
export function roundTo(value: number, scale: number): number {
  const factor = 10 ** scale
  return Math.round(value * factor) / factor
}

/** True when `value` has at most `scale` decimal places (same tolerance as the backend Decimal::exact). */
export function hasAtMostDecimals(value: number, scale: number): boolean {
  return Math.abs(value - roundTo(value, scale)) <= 1e-9
}

export interface DecimalRule {
  min: number
  minExclusive: boolean
  max: number
  scale: number
}

export const VOLTAGE_RULE: DecimalRule = {
  min: 0,
  minExclusive: true,
  max: MAX_VOLTAGE,
  scale: SCALE_VOLTAGE,
}
export const FREQUENCY_RULE: DecimalRule = {
  min: 0,
  minExclusive: false,
  max: MAX_FREQUENCY,
  scale: SCALE_FREQUENCY,
}
export const CABLE_CROSS_SECTION_RULE: DecimalRule = {
  min: 0,
  minExclusive: true,
  max: MAX_CABLE_CROSS_SECTION,
  scale: SCALE_CABLE_CROSS_SECTION,
}
export const SPACING_RULE: DecimalRule = {
  min: 0,
  minExclusive: false,
  max: MAX_SPACING_MM,
  scale: SCALE_SPACING,
}

/** Returns an error message, or null when the number satisfies the rule. */
export function checkDecimal(value: number, rule: DecimalRule): string | null {
  if (!Number.isFinite(value) || !hasAtMostDecimals(value, rule.scale)) {
    return `Must have at most ${rule.scale} decimal places.`
  }
  const rounded = roundTo(value, rule.scale)
  if (rounded < rule.min || (rule.minExclusive && rounded <= rule.min) || rounded > rule.max) {
    return `Must be ${rule.minExclusive ? 'greater than' : 'at least'} ${rule.min} and at most ${rule.max}.`
  }
  return null
}
