/**
 * The two-row layout (`layoutVersion` 1) frozen as it was before the compact cable layout: one cable
 * row/column per side, inputs and outputs in list order, pad 5 mm, pitch 10 mm, margin 20 mm.
 * Used only by `convertLayout` to know where the stored bends of a v1 panel were drawn; the
 * constants below are deliberately local so later changes of `geometry.ts` never touch it.
 * Rails, elements, blocks, busbars and terminal rows did not change and come from `geometry.ts`.
 */
import {
  addRowBlocks,
  buildRailBodies,
  MODULE,
  ROW_BLOCK_H,
  type CableBox,
  type CableWireSpot,
  type Layout,
} from './geometry'
import type { CableSide, CableWire, OutputLoad, PanelContent } from './panelContent'

const MARGIN_V1 = 200
const CABLE_BOX_H_V1 = 250
const CABLE_PAD_V1 = 50
const CABLE_PITCH_V1 = 100
const CABLE_GAP_V1 = 100
const CABLE_ROW_GAP_V1 = 150

const boxLength = (wireCount: number) => 2 * CABLE_PAD_V1 + wireCount * CABLE_PITCH_V1

interface CableItemV1 {
  cable: { id: string; label: string; wires: CableWire[] }
  kind: 'input' | 'output'
  index: number
  load: OutputLoad | null
}

function cablesOnSide(content: PanelContent, side: CableSide): CableItemV1[] {
  const items: CableItemV1[] = []
  if (content.inputCableSide === side) {
    content.inputCables.forEach((cable, index) =>
      items.push({ cable, kind: 'input', index, load: null }),
    )
  }
  if (content.outputCableSide === side) {
    content.outputCables.forEach((cable, index) =>
      items.push({ cable, kind: 'output', index, load: cable.load }),
    )
  }
  return items
}

function cablesLength(items: readonly CableItemV1[]): number {
  if (items.length === 0) return 0
  return (
    items.reduce((sum, i) => sum + boxLength(i.cable.wires.length), 0) +
    (items.length - 1) * CABLE_GAP_V1
  )
}

function placeCables(
  items: readonly CableItemV1[],
  side: CableSide,
  x0: number,
  y0: number,
  spots: Map<string, CableWireSpot>,
): CableBox[] {
  const horizontal = side === 'top' || side === 'bottom'
  let pos = horizontal ? x0 : y0
  return items.map(({ cable, kind, index, load }) => {
    const len = boxLength(cable.wires.length)
    const x = horizontal ? pos : x0
    const y = horizontal ? y0 : pos
    const edgeX = side === 'left' ? x + CABLE_BOX_H_V1 : x
    const edgeY = side === 'top' ? y + CABLE_BOX_H_V1 : y
    const wires = cable.wires.map((wire, i) => {
      const along = CABLE_PAD_V1 + CABLE_PITCH_V1 * i + CABLE_PITCH_V1 / 2
      return {
        id: wire.id,
        colour: wire.colour,
        pt: horizontal ? { x: x + along, y: edgeY } : { x: edgeX, y: y + along },
      }
    })
    const box: CableBox = {
      id: cable.id,
      kind,
      side,
      index,
      line: 0,
      load,
      label: cable.label,
      x,
      y,
      w: horizontal ? len : CABLE_BOX_H_V1,
      h: horizontal ? CABLE_BOX_H_V1 : len,
      wires,
    }
    for (const wire of wires) spots.set(wire.id, { pt: wire.pt, kind, side, cableId: cable.id })
    pos += len + CABLE_GAP_V1
    return box
  })
}

/** The `layoutVersion` 1 layout of a panel (not cached; used once per conversion). */
export function computeLayoutV1(content: PanelContent): Layout {
  const cableWires = new Map<string, CableWireSpot>()
  const railW = content.railWidthModules
  const sides = {
    top: cablesOnSide(content, 'top'),
    bottom: cablesOnSide(content, 'bottom'),
    left: cablesOnSide(content, 'left'),
    right: cablesOnSide(content, 'right'),
  }

  const railsLeft = MARGIN_V1 + (sides.left.length > 0 ? CABLE_BOX_H_V1 + CABLE_ROW_GAP_V1 : 0)
  const railsRight = railsLeft + railW * MODULE
  const topBoxes = placeCables(sides.top, 'top', railsLeft, MARGIN_V1, cableWires)
  const topRowY = sides.top.length > 0 ? MARGIN_V1 + CABLE_BOX_H_V1 + CABLE_ROW_GAP_V1 : MARGIN_V1
  const railsTop = topRowY + ROW_BLOCK_H + CABLE_ROW_GAP_V1
  const leftBoxes = placeCables(sides.left, 'left', MARGIN_V1, railsTop, cableWires)
  const rightBoxes = placeCables(
    sides.right,
    'right',
    railsRight + CABLE_ROW_GAP_V1,
    railsTop,
    cableWires,
  )

  const bodies = buildRailBodies(content, railsLeft, railsTop)
  const sideBottom = Math.max(
    bodies.lastBottom ?? railsTop,
    railsTop + cablesLength(sides.left),
    railsTop + cablesLength(sides.right),
  )
  const outTop = sideBottom + CABLE_ROW_GAP_V1
  const bottomBoxes = placeCables(sides.bottom, 'bottom', railsLeft, outTop, cableWires)
  const bottomRowY = sides.bottom.length > 0 ? outTop + CABLE_BOX_H_V1 + CABLE_ROW_GAP_V1 : outTop
  addRowBlocks(content, bodies.blocks, railsLeft, topRowY, bottomRowY)

  const width =
    MARGIN_V1 +
    Math.max(
      railsRight + (sides.right.length > 0 ? CABLE_ROW_GAP_V1 + CABLE_BOX_H_V1 : 0),
      railsLeft + cablesLength(sides.top),
      railsLeft + cablesLength(sides.bottom),
    )
  const all = [...topBoxes, ...leftBoxes, ...rightBoxes, ...bottomBoxes]
  return {
    railsLeft,
    topRowY,
    railsTop,
    railWidthModules: railW,
    bandTop: bottomRowY, // meaningless in v1: only satisfies the Layout type
    bottomRowY,
    width,
    height: bottomRowY + ROW_BLOCK_H + MARGIN_V1,
    cableBoxes: all,
    inputBoxes: all.filter((b) => b.kind === 'input'),
    outputBoxes: all.filter((b) => b.kind === 'output'),
    rails: bodies.rails,
    elements: bodies.elements,
    blocks: bodies.blocks,
    busbars: bodies.busbars,
    cableWires,
  }
}
