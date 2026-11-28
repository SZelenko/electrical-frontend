/** Placement of elements and terminal blocks on a rail: snapping, fit, overlap, width rules. */
import type { Layout } from './geometry'
import { ELEMENT_H, MODULE, ROW_BLOCK_H } from './geometry'
import {
  ATS_MIN_WIDTH,
  MAX_RAIL_WIDTH,
  MIN_RAIL_WIDTH,
  maxPolesForWidth,
  minWidthForPoles,
} from './limits'
import {
  ROW_IDS,
  rowBlocks,
  type PanelContent,
  type PanelElement,
  type Rail,
  type RowId,
  type TerminalBlock,
} from './panelContent'

export type PlacementError =
  | 'invalidSize'
  | 'negativeOffset'
  | 'outOfRail'
  | 'overlap'
  | 'tooNarrowForPoles'
  | 'tooNarrowForAts'
  | 'outOfRow'
  | 'railTooNarrow'
  | 'rowOverflow'

export interface Span {
  id: string
  offset: number
  width: number
}

export function railSpans(rail: Rail): Span[] {
  return [
    ...rail.elements.map((e) => ({ id: e.id, offset: e.offsetModules, width: e.widthModules })),
    ...rail.terminalBlocks.map((b) => ({
      id: b.id,
      offset: b.offsetModules,
      width: b.widthModules,
    })),
  ]
}

/** Rightmost occupied module end of the rail (0 when empty). */
export function rightmostEnd(rail: Rail): number {
  return railSpans(rail).reduce((max, s) => Math.max(max, s.offset + s.width), 0)
}

/** Checks that an item of `width` modules fits at `offset`, ignoring the item `ignoreId` itself. */
export function checkPlacement(
  rail: Rail,
  railWidth: number,
  ignoreId: string | null,
  offset: number,
  width: number,
): PlacementError | null {
  if (!Number.isInteger(offset) || !Number.isInteger(width) || width < 1) return 'invalidSize'
  if (offset < 0) return 'negativeOffset'
  if (offset + width > railWidth) return 'outOfRail'
  for (const s of railSpans(rail)) {
    if (s.id === ignoreId) continue
    if (offset < s.offset + s.width && s.offset < offset + width) return 'overlap'
  }
  return null
}

/** Snaps a drawing x (tenths of mm) to a whole module offset on a rail (not clamped). */
export function snapOffset(layout: Pick<Layout, 'railsLeft'>, xU: number): number {
  return Math.round((xU - layout.railsLeft) / MODULE) || 0 // normalises -0
}

/** Nearest valid offset to `wanted` for an item of `width`, or null when nothing fits on the rail. */
export function nearestFreeOffset(
  rail: Rail,
  railWidth: number,
  ignoreId: string | null,
  wanted: number,
  width: number,
): number | null {
  let best: number | null = null
  for (let o = 0; o + width <= railWidth; o++) {
    if (checkPlacement(rail, railWidth, ignoreId, o, width) !== null) continue
    if (best === null || Math.abs(o - wanted) < Math.abs(best - wanted)) best = o
  }
  return best
}

/** First free offset (from the left) for a new item of `width`, or null. */
export function firstFreeOffset(rail: Rail, railWidth: number, width: number): number | null {
  for (let o = 0; o + width <= railWidth; o++) {
    if (checkPlacement(rail, railWidth, null, o, width) === null) return o
  }
  return null
}

/** Index of the rail whose band (element height around its centre line) contains `yU`, or null. */
export function railAtY(layout: Layout, yU: number): number | null {
  for (const r of layout.rails) {
    if (yU >= r.cy - ELEMENT_H / 2 && yU <= r.cy + ELEMENT_H / 2) return r.index
  }
  return null
}

/** New width of an element (E13): a device not below ceil(poles/4), an ATS not below 2; must fit. */
export function checkElementWidth(
  rail: Rail,
  railWidth: number,
  element: PanelElement,
  width: number,
  poleCount = element.kind === 'device' ? element.poles.length : 0,
): PlacementError | null {
  if (!Number.isInteger(width) || width < 1) return 'invalidSize'
  if (element.kind === 'ats') {
    if (width < ATS_MIN_WIDTH) return 'tooNarrowForAts'
  } else if (poleCount > maxPolesForWidth(width) || width < minWidthForPoles(poleCount)) {
    return 'tooNarrowForPoles'
  }
  return checkPlacement(rail, railWidth, element.id, element.offsetModules, width)
}

// ---- terminal row ----

/**
 * Checks that a row block of `width` modules fits at `offset` (offsets count from the rail start;
 * `capacity` = rail width), ignoring `ignoreId`.
 */
export function checkRowPlacement(
  row: readonly TerminalBlock[],
  capacity: number,
  ignoreId: string | null,
  offset: number,
  width: number,
): PlacementError | null {
  if (!Number.isInteger(offset) || !Number.isInteger(width) || width < 1) return 'invalidSize'
  if (offset < 0) return 'negativeOffset'
  if (offset + width > capacity) return 'outOfRow'
  for (const b of row) {
    if (b.id === ignoreId) continue
    if (offset < b.offsetModules + b.widthModules && b.offsetModules < offset + width)
      return 'overlap'
  }
  return null
}

/** First free offset (from the left) for a new row block of `width`, or null. */
export function firstFreeRowOffset(
  row: readonly TerminalBlock[],
  capacity: number,
  width: number,
): number | null {
  for (let o = 0; o + width <= capacity; o++) {
    if (checkRowPlacement(row, capacity, null, o, width) === null) return o
  }
  return null
}

/** The terminal row whose band (`ROW_BLOCK_H` high) contains `yU`, or null. */
export function inRowBand(
  layout: Pick<Layout, 'topRowY' | 'bottomRowY'>,
  yU: number,
): RowId | null {
  if (yU >= layout.topRowY && yU <= layout.topRowY + ROW_BLOCK_H) return 'top'
  if (yU >= layout.bottomRowY && yU <= layout.bottomRowY + ROW_BLOCK_H) return 'bottom'
  return null
}

/** Nearest valid offset to `wanted` for a row block of `width`, or null when nothing fits in the row. */
export function nearestFreeRowOffset(
  row: readonly TerminalBlock[],
  capacity: number,
  ignoreId: string | null,
  wanted: number,
  width: number,
): number | null {
  let best: number | null = null
  for (let o = 0; o + width <= capacity; o++) {
    if (checkRowPlacement(row, capacity, ignoreId, o, width) !== null) continue
    if (best === null || Math.abs(o - wanted) < Math.abs(best - wanted)) best = o
  }
  return best
}

/** True when every row block still fits into `capacity` modules. */
export function rowFits(row: readonly TerminalBlock[], capacity: number): boolean {
  return row.every((b) => b.offsetModules + b.widthModules <= capacity)
}

/** New panel-wide rail width: 1..60, not below the rightmost item end of any rail or of either terminal row. */
export function checkRailWidth(content: PanelContent, width: number): PlacementError | null {
  if (!Number.isInteger(width) || width < MIN_RAIL_WIDTH || width > MAX_RAIL_WIDTH)
    return 'invalidSize'
  if (content.rails.some((r) => width < rightmostEnd(r))) return 'railTooNarrow'
  if (ROW_IDS.some((row) => !rowFits(rowBlocks(content, row), width))) return 'rowOverflow'
  return null
}
