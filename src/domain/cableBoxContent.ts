/** Content of a cable box: icon, caption and label positions and text fitting (panel-domain "Cable box content"). */
import { CABLE_ICON, CABLE_LABEL_INSET, type CableBox, type Pt } from './geometry'

/** Depths measured from the box's outer edge (the edge away from the wire points), in u. */
export const CABLE_ICON_DEPTH = 20
export const CABLE_CAPTION_DEPTH = 120
export const CABLE_LABEL_DEPTH = 170

/** Normal text size (3.5 mm) and the smallest it is scaled down to (1.8 mm), in u. */
export const CABLE_TEXT_SIZE = 35
export const CABLE_TEXT_MIN_SIZE = 18

/** Average glyph width relative to the font size, used to estimate the text length. */
const GLYPH_WIDTH = 0.6

/** Wire point of a cable box: visual dot radius including the stroke, and pointer hit radius (5 mm pitch: they never overlap). */
export const CABLE_DOT_R = 18
/** Stroke width of the dot (half of it lies inside `CABLE_DOT_R`). */
export const CABLE_DOT_STROKE = 8
export const CABLE_HIT_R = 25

export interface CableBoxContent {
  /** Centre of the `CABLE_ICON` square. */
  icon: Pt
  caption: Pt
  label: Pt
  /** Left/right boxes: icon and text are rotated -90 degrees (they read bottom to top). */
  rotated: boolean
  /** Room for a text along the box: its length without `CABLE_LABEL_INSET` at both ends. */
  room: number
}

/** Anchors of the icon, caption and label (centred along the box, at the contract's depths from the outer edge). */
export function cableBoxContent(box: CableBox): CableBoxContent {
  const at = (depth: number, along: number): Pt => {
    switch (box.side) {
      case 'top':
        return { x: along, y: box.y + depth }
      case 'bottom':
        return { x: along, y: box.y + box.h - depth }
      case 'left':
        return { x: box.x + depth, y: along }
      case 'right':
        return { x: box.x + box.w - depth, y: along }
    }
  }
  const horizontal = box.side === 'top' || box.side === 'bottom'
  const along = horizontal ? box.x + box.w / 2 : box.y + box.h / 2
  const length = horizontal ? box.w : box.h
  return {
    icon: at(CABLE_ICON_DEPTH + CABLE_ICON / 2, along),
    caption: at(CABLE_CAPTION_DEPTH, along),
    label: at(CABLE_LABEL_DEPTH, along),
    rotated: !horizontal,
    room: length - 2 * CABLE_LABEL_INSET,
  }
}

export interface FittedText {
  text: string
  /** Font size in u: 35 scaled down to fit, never below 18. */
  size: number
  /** True when the text had to be cut (the full text belongs in a tooltip). */
  truncated: boolean
}

/** Fits `text` into `room`: scaled down first (not below 1.8 mm), then truncated with an ellipsis. */
export function fitCableText(text: string, room: number): FittedText {
  const chars = [...text]
  const width = (n: number, size: number) => n * size * GLYPH_WIDTH
  if (width(chars.length, CABLE_TEXT_SIZE) <= room) {
    return { text, size: CABLE_TEXT_SIZE, truncated: false }
  }
  const size = Math.max(CABLE_TEXT_MIN_SIZE, Math.floor(room / (chars.length * GLYPH_WIDTH)))
  if (width(chars.length, size) <= room) return { text, size, truncated: false }
  // the ellipsis takes one glyph
  const keep = Math.max(0, Math.floor(room / (CABLE_TEXT_MIN_SIZE * GLYPH_WIDTH)) - 1)
  return { text: `${chars.slice(0, keep).join('')}…`, size: CABLE_TEXT_MIN_SIZE, truncated: true }
}
