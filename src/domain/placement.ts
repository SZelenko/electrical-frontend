/** Placement of elements and terminal blocks on a rail: snapping, fit, overlap, width rules. */
import type { Layout } from './geometry'
import { ELEMENT_H, MARGIN, MODULE, ROW_BLOCK_H } from './geometry'
import {
  ATS_MIN_WIDTH,
  MAX_RAIL_WIDTH,
  MIN_RAIL_WIDTH,
  maxPolesForWidth,
  minWidthForPoles,
} from './limits'
import type { PanelContent, PanelElement, Rail, TerminalBlock } from './panelContent'

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
export function snapOffset(xU: number): number {
  return Math.round((xU - MARGIN) / MODULE) || 0 // normalises -0
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
 * Checks that a row block of `width` modules fits at `offset` (offsets count from the end of the input
 * cables; `capacity` = rail width minus that start), ignoring `ignoreId`.
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

/** True when `yU` lies within the terminal-row band (the height of the input cable boxes). */
export function inRowBand(yU: number): boolean {
  return yU >= MARGIN && yU <= MARGIN + ROW_BLOCK_H
}

/** True when every row block still fits into `capacity` modules. */
export function rowFits(row: readonly TerminalBlock[], capacity: number): boolean {
  return row.every((b) => b.offsetModules + b.widthModules <= capacity)
}

/**
 * New panel-wide rail width: 1..60, not below the rightmost item end of any rail, and the terminal
 * row (capacity = width minus the row start) must still hold its blocks.
 */
export function checkRailWidth(
  content: PanelContent,
  width: number,
  rowStartModules: number,
): PlacementError | null {
  if (!Number.isInteger(width) || width < MIN_RAIL_WIDTH || width > MAX_RAIL_WIDTH)
    return 'invalidSize'
  if (content.rails.some((r) => width < rightmostEnd(r))) return 'railTooNarrow'
  if (!rowFits(content.terminalRow, width - rowStartModules)) return 'rowOverflow'
  return null
}
