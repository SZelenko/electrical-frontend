<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import {
  moveBend,
  moveItem,
  moveRowBlock,
  copyItem,
  toggleElement,
  updateBusbar,
  insertBend,
  removeBend,
  addWire,
  totalBends,
  type Command,
  type CopyTarget,
} from '@/domain/commands'
import {
  computeLayout,
  endpointDirection,
  endpointPoint,
  viewBounds,
  wirePolyline,
  roundedPath,
  WIRE_COLOUR_HEX,
  WIRE_STROKE_MM,
  ROW_BLOCK_H,
  MODULE,
  type Layout,
  type Pt,
} from '@/domain/geometry'
import {
  finishDrawnRoute,
  moveBend as moveBendOp,
  nearestSegment,
  snapToAxis,
} from '@/domain/routes'
import { inRowBand, railAtY, snapOffset } from '@/domain/placement'
import { maxBusbarCount, railItems } from '@/domain/busbars'
import {
  drawingKey,
  endpointKey,
  formatInputCableLabel,
  type ContactSide,
  type Endpoint,
  ROW_IDS,
  rowBlocks,
  type PanelContent,
  type RowId,
} from '@/domain/panelContent'
import type { ItemRef } from '@/domain/validateContent'
import BendHandles from './BendHandles.vue'
import AtsShape from './shapes/AtsShape.vue'
import CableRow from './CableRow.vue'
import { shapeFor } from './shapes/registry'
import ItemContacts from './ItemContacts.vue'
import BusbarShape from './BusbarShape.vue'
import RailShape from './RailShape.vue'
import RowBlockShape from './RowBlockShape.vue'
import TerminalBlockShape from './TerminalBlockShape.vue'
import WirePath from './WirePath.vue'
import { t } from '@/i18n'
import { rejectionText } from './messages'
import { newId } from './newId'
import { useEditorContext } from './useEditor'
import { useViewport } from './useViewport'
import { MAX_BENDS_PER_WIRE, MAX_TOTAL_BENDS, MAX_WIRES } from '@/domain/limits'
import { defaultWireColour } from '@/domain/wireDefaults'
import { samePt } from '@/domain/autoRoute'

const ctx = useEditorContext()
const store = ctx.store
const svg = useTemplateRef<SVGSVGElement>('svg')
const { view, fit, toUnits, zoomAt, panByPixels } = useViewport()

type Gesture =
  | {
      type: 'pan'
      startX: number
      startY: number
      from: typeof view.value
      /** While drawing a wire, a click on the background (no drag) places a bend. */
      bendOnClick: boolean
      moved: boolean
    }
  | {
      type: 'item'
      id: string
      kind: 'element' | 'block'
      /** The item lives in the terminal row (a row block). */
      row: boolean
      /** The drag started on a toggle zone: a click without movement switches the element. */
      toggle: boolean
      /** Id the copy gets when the item is dropped with Ctrl/Cmd held (also used for the preview check). */
      copyId: string
      grabDx: number
      startX: number
      startY: number
      moved: boolean
      /** Modifier state at the last pointer move (the drop re-reads it). */
      copy: boolean
      target: (CopyTarget & { offset: number }) | null
      error: string | null
      preview: PanelContent | null
      ghost: Ghost | null
    }
  | { type: 'bend'; wireId: string; k: number; moved: boolean; to: Pt; bends: Pt[] }
  | {
      /** Dragging the right end of a busbar: the covered count follows the pointer. */
      type: 'busbarEdge'
      id: string
      count: number
      moved: boolean
      preview: PanelContent | null
    }
interface Ghost {
  x: number
  y: number
  w: number
  h: number
  /** A valid copy preview, as opposed to the red "cannot drop here" box. */
  copy: boolean
}
const gesture = shallowRef<Gesture | null>(null)
const pointer = shallowRef<Pt | null>(null)

const content = computed(() => {
  const g = gesture.value
  return ((g?.type === 'item' || g?.type === 'busbarEdge') && g.preview) || store.content
})
const layout = computed<Layout | null>(() => {
  const g = gesture.value
  if ((g?.type === 'item' || g?.type === 'busbarEdge') && g.preview) return computeLayout(g.preview)
  return store.layout
})
const translucent = computed(() => ctx.translucent.value)

/** Busbars to draw with their selection / problem state. */
const busbarShapes = computed(() => {
  const l = layout.value
  if (!l) return []
  return [...l.busbars.values()]
})
const busbarInvalid = (id: string) => violationIds.value.has(id) || store.invalidBusbars.has(id)

const wireData = computed(() => {
  const c = content.value
  const l = layout.value
  if (!c || !l) return []
  return c.wires.flatMap((wire) => {
    const pts = wirePolyline(l, wire)
    if (!pts) return []
    return [{ wire, d: roundedPath(pts) }]
  })
})

/** During a bend drag only the dragged wire is redrawn from its preview bends. */
const bendDrag = computed(() => {
  const g = gesture.value
  const l = layout.value
  const wire = g?.type === 'bend' && g.moved ? store.index?.wires.get(g.wireId)?.wire : undefined
  if (!g || g.type !== 'bend' || !wire || !l) return null
  const pts = wirePolyline(l, { ...wire, bends: g.bends })
  return pts ? { id: wire.id, d: roundedPath(pts) } : null
})

const selection = computed(() => store.selection)
const selectedWire = computed(() => {
  const s = selection.value
  if (s?.kind !== 'wire' || !content.value) return null
  const g = gesture.value
  const wire = content.value.wires.find((w) => w.id === s.id)
  if (!wire) return null
  return g?.type === 'bend' && g.wireId === wire.id ? { ...wire, bends: g.bends } : wire
})

const violationIds = computed(
  () => new Set([...store.violationItems].map((key) => key.slice(key.indexOf(':') + 1))),
)
const selectedId = (kind: ItemRef['kind']) =>
  selection.value?.kind === kind ? selection.value.id : null
const selectedCable = (kind: 'inputCable' | 'outputCable'): string | null => {
  const s = selection.value
  if (s?.kind === kind) return s.id
  if (s?.kind === 'cableWire') return store.index?.cableWires.get(s.id)?.cableId ?? null
  return null
}

/** Cable boxes of both kinds; every box is drawn on its own side. */
const cableBoxes = computed(() => layout.value?.cableBoxes ?? [])
/** Blocks of both terminal rows. */
const rowBlockList = computed(() =>
  content.value ? ROW_IDS.flatMap((row) => rowBlocks(content.value as PanelContent, row)) : [],
)

const ROW_BANDS: readonly { id: RowId; testid: string }[] = [
  { id: 'top', testid: 'terminal-row' },
  { id: 'bottom', testid: 'terminal-row-bottom' },
]
const rowY = (l: Layout, row: RowId) => (row === 'top' ? l.topRowY : l.bottomRowY)

const cableTitles = computed(() => {
  const titles: Record<string, string> = {}
  // «Вх 1 · label — detail»: the full caption and label (the drawn ones may be cut) plus the details
  const full = (caption: string, label: string, detail: string) =>
    t('editor.canvas.cableTooltip', { head: [caption, label].filter(Boolean).join(' · '), detail })
  content.value?.inputCables.forEach((c, i) => {
    titles[c.id] = full(
      t('editor.canvas.inputCaption', { n: i + 1 }),
      c.label,
      t('editor.canvas.inputCableTitle', { rating: formatInputCableLabel(c, t) }),
    )
  })
  content.value?.outputCables.forEach((c, i) => {
    titles[c.id] = full(
      t('editor.canvas.outputCaption', { n: i + 1 }),
      c.label,
      c.description
        ? t('editor.canvas.outputCableTitleDescribed', { description: c.description })
        : t('editor.canvas.outputCableTitle'),
    )
  })
  return titles
})

const rubberColour = computed(() =>
  ctx.drawing.value ? WIRE_COLOUR_HEX[ctx.drawing.value.colour] : undefined,
)
// A double-click on the end contact must not start a new wire right after finishing one.
let lastFinish: { key: string; time: number } | null = null

/** The contact the wire being drawn started from (ring marker). */
const drawingStart = computed(() => {
  const d = ctx.drawing.value
  const l = store.layout
  return d && l ? endpointPoint(l, d.start) : null
})

const rubber = computed(() => {
  const d = ctx.drawing.value
  const l = store.layout
  if (!d || !l) return null
  const a = endpointPoint(l, d.start)
  if (!a) return null
  const pts = [a, ...d.bends]
  if (pointer.value) pts.push(snapToAxis(pts[pts.length - 1] as Pt, pointer.value))
  return pts.map((p) => `${p.x},${p.y}`).join(' ')
})

function fitView() {
  if (store.layout && store.content) fit(viewBounds(store.layout, store.content.wires))
}
onMounted(fitView)
watch(
  () => store.panelId,
  () => fitView(),
)

function endpointFrom(el: Element): Endpoint | null {
  const ds = (el as SVGElement).dataset
  const a = ds.epA
  if (!a) return null
  switch (ds.epKind) {
    case 'pole':
      return ds.epSide === 'input' || ds.epSide === 'output'
        ? { kind: 'pole', elementId: a, poleIndex: Number(ds.epB), side: ds.epSide }
        : null
    case 'terminal': {
      const side = ds.epCs
      return side === 'top' || side === 'bottom' || side === 'left' || side === 'right'
        ? {
            kind: 'terminal',
            terminalBlockId: a,
            terminalIndex: Number(ds.epB),
            contactSide: side satisfies ContactSide,
          }
        : null
    }
    case 'cableWire':
      return { kind: 'cableWire', cableWireId: a }
    case 'busbar':
      return { kind: 'busbar', busbarId: a, feedIndex: Number(ds.epB) }
    default:
      return null
  }
}

function units(e: PointerEvent | MouseEvent): Pt | null {
  return svg.value ? toUnits(svg.value, e.clientX, e.clientY) : null
}

function hitOf(e: Event): SVGElement | null {
  return e.target instanceof Element ? e.target.closest<SVGElement>('[data-kind]') : null
}

function onTerminal(el: SVGElement, e: PointerEvent) {
  const ep = endpointFrom(el)
  if (!ep || store.readOnly || !store.content || !store.layout) return
  const drawing = ctx.drawing.value
  if (!drawing) {
    if (e.detail >= 2) return
    if (lastFinish && lastFinish.key === drawingKey(ep) && e.timeStamp - lastFinish.time < 500)
      return
    if (store.content.wires.length >= MAX_WIRES) {
      ctx.say(rejectionText('limit', t, 'wires'), 'error')
      return
    }
    pointer.value = null
    ctx.drawing.value = {
      start: ep,
      bends: [],
      colour: defaultWireColour(store.content, ep, ctx.wireColour.value),
      content: store.content,
    }
    return
  }
  // the same electrical node (either side of the same contact) cancels the drawing
  if (endpointKey(ep) === endpointKey(drawing.start)) {
    ctx.cancelDrawing()
    return
  }
  const startPt = endpointPoint(store.layout, drawing.start)
  const endPt = endpointPoint(store.layout, ep)
  if (!startPt || !endPt) return
  const bends = finishDrawnRoute(
    startPt,
    drawing.bends,
    endPt,
    endpointDirection(store.layout, ep) ?? 'up',
  )
  const total = totalBends(store.content) + bends.length
  if (bends.length > MAX_BENDS_PER_WIRE || total > MAX_TOTAL_BENDS) {
    ctx.say(t('editor.canvas.tooManyBends'), 'error')
    return
  }
  const outcome = ctx.run(
    addWire({
      id: newId(),
      start: drawing.start,
      end: ep,
      colour: drawing.colour,
      crossSection: ctx.wireCrossSection.value,
      bends,
    }),
    'editor.history.addWire',
  )
  // a rejected wire keeps the drawing so the user can fix the route
  if (!outcome.ok) return
  const last = outcome.content.wires[outcome.content.wires.length - 1]
  if (last) store.select({ kind: 'wire', id: last.id })
  lastFinish = { key: drawingKey(ep), time: e.timeStamp }
  ctx.cancelDrawing()
}

/** A click that is not on a contact while drawing places a bend (W1). */
function addDrawnBend(u: Pt) {
  const d = ctx.drawing.value
  const l = store.layout
  if (!d || !l) return
  if (d.bends.length >= MAX_BENDS_PER_WIRE) {
    ctx.say(t('editor.canvas.bendLimit', { max: MAX_BENDS_PER_WIRE }), 'error')
    return
  }
  const startPt = endpointPoint(l, d.start)
  if (!startPt) return
  const last = d.bends[d.bends.length - 1] ?? startPt
  const p = snapToAxis(last, u)
  if (samePt(p, last)) return
  ctx.drawing.value = { ...d, bends: [...d.bends, p] }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || !svg.value) return
  // Commit a property draft before the selection changes (blur fires the field's commit).
  const active = document.activeElement
  if (active instanceof HTMLElement && active.closest('.properties')) active.blur()
  const hit = hitOf(e)
  if (
    ctx.drawing.value &&
    hit &&
    hit.dataset.kind !== 'terminal' &&
    hit.dataset.kind !== 'background'
  ) {
    const u = units(e)
    if (u) addDrawnBend(u)
    return
  }
  // the toggle zone of an element behaves like the element (select, drag) and also switches on a click
  const onToggle = hit?.dataset.kind === 'toggle'
  const kind = onToggle ? 'element' : hit?.dataset.kind
  const id = hit?.dataset.id
  if (hit && kind === 'terminal') {
    onTerminal(hit, e)
    return
  }
  if (hit && (kind === 'element' || kind === 'block') && id) {
    store.select({ kind, id })
    if (store.readOnly) return
    const u = units(e)
    const item = kind === 'element' ? store.layout?.elements.get(id) : store.layout?.blocks.get(id)
    if (!u || !item) return
    svg.value.setPointerCapture(e.pointerId)
    lastItemPoint = null
    gesture.value = {
      type: 'item',
      id,
      kind,
      row: kind === 'block' && item.railId === null,
      toggle: onToggle,
      copyId: newId(),
      grabDx: u.x - item.x,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      copy: false,
      target: null,
      error: null,
      preview: null,
      ghost: null,
    }
    return
  }
  if (hit && kind === 'busbar-edge' && id) {
    const found = store.index?.busbars.get(id)
    if (!found || store.readOnly || translucent.value) return
    svg.value.setPointerCapture(e.pointerId)
    gesture.value = {
      type: 'busbarEdge',
      id,
      count: found.busbar.count,
      moved: false,
      preview: null,
    }
    return
  }
  if (hit && kind === 'bend') {
    const wireId = hit.dataset.wireId
    const k = Number(hit.dataset.index)
    const wire = store.index?.wires.get(wireId ?? '')?.wire
    if (!wire || store.readOnly) return
    // The pointer is captured on the first move: capturing here would retarget the dblclick
    // (remove bend) from the handle to the svg root.
    gesture.value = {
      type: 'bend',
      wireId: wire.id,
      k,
      moved: false,
      to: wire.bends[k] ?? { x: 0, y: 0 },
      bends: [...wire.bends],
    }
    return
  }
  if (
    hit &&
    id &&
    (kind === 'rail' ||
      kind === 'busbar' ||
      kind === 'inputCable' ||
      kind === 'outputCable' ||
      kind === 'wire')
  ) {
    store.select({ kind, id })
    return
  }
  // background: deselect and pan
  if (!ctx.drawing.value) store.select(null)
  svg.value.setPointerCapture(e.pointerId)
  gesture.value = {
    type: 'pan',
    startX: e.clientX,
    startY: e.clientY,
    from: { ...view.value },
    bendOnClick: ctx.drawing.value !== null,
    moved: false,
  }
}

function snap10(v: number): number {
  return Math.round(v / 10) * 10
}

function onPointerMove(e: PointerEvent) {
  const u = units(e)
  if (ctx.drawing.value && u) pointer.value = u
  const g = gesture.value
  if (!g || !svg.value || !u) return
  if (g.type === 'pan') {
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 4) return
    if (!g.moved) gesture.value = { ...g, moved: true }
    panByPixels(svg.value, e.clientX - g.startX, e.clientY - g.startY, g.from)
    return
  }
  if (g.type === 'bend') {
    const wire = store.index?.wires.get(g.wireId)?.wire
    const l = store.layout
    if (!wire || !l) return
    const a = endpointPoint(l, wire.start)
    const b = endpointPoint(l, wire.end)
    if (!a || !b) return
    if (!g.moved) svg.value.setPointerCapture(e.pointerId)
    const to = { x: snap10(u.x), y: snap10(u.y) }
    gesture.value = {
      ...g,
      moved: true,
      to,
      bends: moveBendOp({ start: a, end: b, bends: wire.bends }, g.k, to),
    }
    return
  }
  if (g.type === 'busbarEdge') {
    dragBusbarEdge(g, u)
    return
  }
  if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 4) return
  if (translucent.value) {
    // items cannot be moved or copied in translucent mode; the gesture only stops being a click
    if (!g.moved) gesture.value = { ...g, moved: true }
    return
  }
  lastItemPoint = u
  dragItem(g, u, e.ctrlKey || e.metaKey)
}

/** The covered count nearest to the pointer, within 2..the adjacent free devices; previews it. */
function dragBusbarEdge(g: Extract<Gesture, { type: 'busbarEdge' }>, u: Pt) {
  const c = store.content
  const found = store.index?.busbars.get(g.id)
  if (!c || !found) return
  const max = maxBusbarCount(found.rail, found.busbar.firstElementId, g.id)
  const items = railItems(found.rail)
  const a = items.findIndex((i) => i.id === found.busbar.firstElementId)
  const boxes = store.layout
  // the count whose right edge is nearest to the pointer
  let count = 2
  let best = Infinity
  for (let k = 2; k <= max; k++) {
    const last = items[a + k - 1]
    const box = last && (boxes?.elements.get(last.id) ?? boxes?.blocks.get(last.id))
    if (!box) break
    const d = Math.abs(box.x + box.w - u.x)
    if (d < best) {
      best = d
      count = k
    }
  }
  if (g.moved && count === g.count) return
  const outcome = updateBusbar(g.id, { count })(c)
  gesture.value = {
    ...g,
    moved: true,
    count,
    preview: outcome.ok && outcome.content !== c ? outcome.content : null,
  }
}

/** Last pointer position (drawing units) of an item drag, for re-evaluating it when Ctrl/Cmd changes. */
let lastItemPoint: Pt | null = null

function dragItem(g: Extract<Gesture, { type: 'item' }>, u: Pt, copy: boolean) {
  const c = store.content
  const l = store.layout
  if (!c || !l) return
  const item = g.kind === 'element' ? l.elements.get(g.id) : l.blocks.get(g.id)
  if (!item) return
  // rail and row offsets both count from the rail start
  const offset = snapOffset(l, u.x - g.grabDx)
  const band = inRowBand(l, u.y)
  const railIndex = g.row && band ? null : railAtY(l, u.y)
  const rail = railIndex === null ? null : c.rails[railIndex]
  const target: Target | null = rail
    ? { railId: rail.id, offset }
    : band
      ? { row: band, offset }
      : null
  const same =
    g.moved &&
    g.copy === copy &&
    g.target?.offset === offset &&
    (g.target && 'railId' in g.target ? g.target.railId : null) ===
      (target && 'railId' in target ? target.railId : null) &&
    (g.target && 'row' in g.target ? g.target.row : null) ===
      (target && 'row' in target ? target.row : null) &&
    (g.target === null) === (target === null)
  if (same) return
  const widthModules = item.w / MODULE
  const pointerGhost: Ghost = {
    x: u.x - g.grabDx,
    y: u.y - item.h / 2,
    w: item.w,
    h: item.h,
    copy: false,
  }
  const wrongZone = target !== null && 'row' in target !== g.row
  if (!target || wrongZone) {
    gesture.value = {
      ...g,
      moved: true,
      copy,
      target: null,
      error: !target
        ? g.row
          ? t('editor.canvas.dragToRow')
          : t('editor.canvas.dragToRail')
        : g.row
          ? t('editor.canvas.rowBlockToRail')
          : t('editor.canvas.railItemToRow'),
      preview: null,
      ghost: pointerGhost,
    }
    return
  }
  const outcome = dropCommand(g, target, copy)(c)
  const spot: Ghost =
    'row' in target
      ? {
          x: l.railsLeft + offset * MODULE,
          y: target.row === 'top' ? l.topRowY : l.bottomRowY,
          w: widthModules * MODULE,
          h: ROW_BLOCK_H,
          copy,
        }
      : {
          x: l.railsLeft + offset * MODULE,
          y: (l.rails[railIndex as number] as { cy: number }).cy - item.h / 2,
          w: widthModules * MODULE,
          h: item.h,
          copy,
        }
  gesture.value = {
    ...g,
    moved: true,
    copy,
    target,
    error: outcome.ok ? null : rejectionText(outcome.reason, t, outcome.detail),
    // a copy leaves the original in place: only a move previews the item at its new position
    preview: outcome.ok && !copy && outcome.content !== c ? outcome.content : null,
    ghost: !outcome.ok || copy ? { ...spot, copy: outcome.ok && copy } : null,
  }
}

type Target = CopyTarget & { offset: number }

/** The command a drop with the given target does: a copy (modifier held) or a move. */
function dropCommand(
  g: Extract<Gesture, { type: 'item' }>,
  target: Target,
  copy: boolean,
): Command {
  if (copy) {
    const into: CopyTarget = 'row' in target ? { row: target.row } : { railId: target.railId }
    return copyItem(g.id, g.copyId, into, target.offset)
  }
  if ('row' in target) return moveRowBlock(g.id, target.offset, target.row)
  return moveItem(g.id, target.railId, target.offset)
}

function onPointerUp(e: PointerEvent) {
  const g = gesture.value
  gesture.value = null
  if (svg.value?.hasPointerCapture(e.pointerId)) svg.value.releasePointerCapture(e.pointerId)
  if (!g) return
  if (g.type === 'pan' && g.bendOnClick && !g.moved) {
    const u = units(e)
    if (u) addDrawnBend(u)
  } else if (g.type === 'item' && !g.moved) {
    if (g.toggle && !store.readOnly && !(e.ctrlKey || e.metaKey)) {
      ctx.run(toggleElement(g.id), 'editor.history.toggle')
    }
  } else if (g.type === 'busbarEdge') {
    if (g.moved && g.preview)
      ctx.run(updateBusbar(g.id, { count: g.count }), 'editor.history.changeBusbarLength')
  } else if (g.type === 'item' && g.moved && translucent.value) {
    // no move or copy in translucent mode
  } else if (g.type === 'item' && g.moved) {
    // the modifier is read at the drop, not at the start of the drag
    const copy = e.ctrlKey || e.metaKey
    const content = store.content
    const check = g.target && content ? dropCommand(g, g.target, copy)(content) : null
    if (!g.target || !check || !check.ok) {
      const reason =
        g.error ??
        (check && !check.ok
          ? rejectionText(check.reason, t, check.detail)
          : t('editor.canvas.failed'))
      ctx.say(
        copy ? t('editor.canvas.notCopied', { reason }) : t('editor.canvas.movedBack', { reason }),
        'error',
      )
      return
    }
    const outcome = ctx.run(
      dropCommand(g, g.target, copy),
      copy
        ? 'editor.history.copy'
        : g.kind === 'element'
          ? 'editor.history.moveElement'
          : 'editor.history.moveBlock',
    )
    if (outcome.ok && copy) store.select({ kind: g.kind, id: g.copyId })
  } else if (g.type === 'bend' && g.moved) {
    ctx.run(moveBend(g.wireId, g.k, g.to), 'editor.history.moveBend')
  }
}

/** Enter / Space on a focused toggle zone switches the element (one history entry). */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const hit =
    e.target instanceof Element ? e.target.closest<SVGElement>('[data-kind=toggle]') : null
  const id = hit?.dataset.id
  if (!id || store.readOnly || ctx.drawing.value) return
  e.preventDefault()
  ctx.run(toggleElement(id), 'editor.history.toggle')
}

function onModifierKey(e: KeyboardEvent) {
  if (e.key !== 'Control' && e.key !== 'Meta') return
  const g = gesture.value
  if (translucent.value || g?.type !== 'item' || !g.moved || !lastItemPoint) return
  dragItem(g, lastItemPoint, e.ctrlKey || e.metaKey)
}
onMounted(() => {
  window.addEventListener('keydown', onModifierKey)
  window.addEventListener('keyup', onModifierKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onModifierKey)
  window.removeEventListener('keyup', onModifierKey)
})

function onPointerCancel() {
  gesture.value = null
}

function onDblClick(e: MouseEvent) {
  const hit = hitOf(e)
  if (!hit || store.readOnly || ctx.drawing.value) return
  if (hit.dataset.kind === 'bend' && hit.dataset.wireId) {
    ctx.run(removeBend(hit.dataset.wireId, Number(hit.dataset.index)), 'editor.history.removeBend')
  } else if (hit.dataset.kind === 'wire' && hit.dataset.id) {
    const u = units(e)
    const l = store.layout
    const wire = store.index?.wires.get(hit.dataset.id)?.wire
    if (!u || !l || !wire) return
    const a = endpointPoint(l, wire.start)
    const b = endpointPoint(l, wire.end)
    if (!a || !b) return
    const segment = nearestSegment({ start: a, end: b, bends: wire.bends }, u)
    ctx.run(insertBend(wire.id, segment, u), 'editor.history.insertBend')
  }
}

function onWheel(e: WheelEvent) {
  if (!svg.value) return
  zoomAt(svg.value, e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015))
}

function zoomButton(factor: number) {
  const el = svg.value
  if (!el) return
  const r = el.getBoundingClientRect()
  zoomAt(el, r.left + r.width / 2, r.top + r.height / 2, factor)
}

const drawingHint = computed(() => (ctx.drawing.value ? t('editor.canvas.drawingHint') : null))
const dragHint = computed(() => {
  const g = gesture.value
  return g?.type === 'item' && g.error ? g.error : null
})
</script>

<template>
  <div class="canvas-wrap">
    <svg
      ref="svg"
      class="canvas"
      :class="{ drawing: ctx.drawing.value }"
      :viewBox="`${view.x} ${view.y} ${view.w} ${view.h}`"
      role="application"
      :aria-label="t('editor.canvas.ariaLabel')"
      data-testid="panel-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @dblclick="onDblClick"
      @keydown="onKeydown"
      @contextmenu.prevent
      @wheel.prevent="onWheel"
    >
      <g v-if="layout && content" transform="scale(0.1)">
        <rect :width="layout.width" :height="layout.height" class="sheet" data-kind="background" />
        <RailShape
          v-for="rail in layout.rails"
          :key="rail.id"
          :rail="rail"
          :selected="selectedId('rail') === rail.id"
          :violation="violationIds.has(rail.id)"
        />
        <g
          v-for="row in ROW_BANDS"
          :key="row.id"
          class="row-band"
          pointer-events="none"
          :data-testid="row.testid"
        >
          <rect
            :x="layout.railsLeft"
            :y="rowY(layout, row.id)"
            :width="layout.railWidthModules * MODULE"
            :height="ROW_BLOCK_H"
            class="row-band-rect"
          />
          <text :x="layout.railsLeft + 20" :y="rowY(layout, row.id) - 20" class="row-band-label">
            {{ t(`domain.rowTitle.${row.id}`) }}
          </text>
        </g>
        <!-- wires lie under the device bodies; contacts, feeds and handles come above them -->
        <WirePath
          v-for="{ wire, d } in wireData"
          :key="wire.id"
          :wire="wire"
          :d="bendDrag?.id === wire.id ? bendDrag.d : d"
          :selected="selectedId('wire') === wire.id"
          :short-circuit="store.shortCircuitWires.has(wire.id)"
          :focused="ctx.focusedWires.value.has(wire.id)"
          :violation="violationIds.has(wire.id)"
          :hit="!translucent"
        />
        <g class="bodies" :class="{ translucent }" data-testid="bodies">
          <CableRow
            layer="body"
            :boxes="cableBoxes"
            :selected-id="selectedCable('inputCable') ?? selectedCable('outputCable')"
            :violation-ids="violationIds"
            :titles="cableTitles"
          />
          <RowBlockShape
            v-for="block in rowBlockList"
            :key="block.id"
            :block="block"
            :box="layout.blocks.get(block.id)!"
            :selected="selectedId('block') === block.id"
            :violation="violationIds.has(block.id)"
          />
          <template v-for="rail in content.rails" :key="rail.id">
            <TerminalBlockShape
              v-for="block in rail.terminalBlocks"
              :key="block.id"
              :block="block"
              :box="layout.blocks.get(block.id)!"
              :selected="selectedId('block') === block.id"
              :violation="violationIds.has(block.id)"
            />
            <template v-for="element in rail.elements" :key="element.id">
              <AtsShape
                v-if="element.kind === 'ats'"
                :element="element"
                :box="layout.elements.get(element.id)!"
                :selected="selectedId('element') === element.id"
                :violation="violationIds.has(element.id)"
              />
              <component
                :is="shapeFor(element.style)"
                v-else
                :element="element"
                :box="layout.elements.get(element.id)!"
                :selected="selectedId('element') === element.id"
                :violation="violationIds.has(element.id)"
              />
            </template>
          </template>
          <BusbarShape
            v-for="box in busbarShapes"
            :key="box.id"
            layer="body"
            :box="box"
            :selected="selectedId('busbar') === box.id"
            :violation="busbarInvalid(box.id)"
            :handle="false"
          />
        </g>
        <!-- translucent mode: an invisible wide stroke above the bodies keeps wires clickable -->
        <g v-if="translucent" class="wire-hits">
          <path
            v-for="{ wire, d } in wireData"
            :key="wire.id"
            :d="bendDrag?.id === wire.id ? bendDrag.d : d"
            fill="none"
            stroke="transparent"
            :stroke-width="Math.max(WIRE_STROKE_MM[wire.crossSection] * 10, 50)"
            stroke-linejoin="round"
            class="wire-hit"
            data-kind="wire"
            data-testid="wire"
            :data-id="wire.id"
          />
        </g>
        <!-- contacts are drawn above the wires so they stay clickable -->
        <CableRow
          layer="contacts"
          :boxes="cableBoxes"
          :selected-id="null"
          :violation-ids="violationIds"
          :titles="cableTitles"
        />
        <ItemContacts
          v-for="block in rowBlockList"
          :key="block.id"
          :box="layout.blocks.get(block.id)!"
          :block="block"
        />
        <template v-for="rail in content.rails" :key="rail.id">
          <ItemContacts
            v-for="block in rail.terminalBlocks"
            :key="block.id"
            :box="layout.blocks.get(block.id)!"
            :block="block"
          />
          <ItemContacts
            v-for="element in rail.elements"
            :key="element.id"
            :box="layout.elements.get(element.id)!"
            :element="element"
            :read-only="store.readOnly"
          />
        </template>
        <BusbarShape
          v-for="box in busbarShapes"
          :key="box.id"
          layer="contacts"
          :box="box"
          :selected="false"
          :violation="false"
          :handle="
            selectedId('busbar') === box.id && !store.readOnly && !translucent && !ctx.drawing.value
          "
        />
        <circle
          v-if="drawingStart"
          :cx="drawingStart.x"
          :cy="drawingStart.y"
          r="34"
          class="start-ring"
          pointer-events="none"
          data-testid="drawing-start"
        />
        <BendHandles
          v-if="selectedWire && !store.readOnly && !ctx.drawing.value"
          :wire-id="selectedWire.id"
          :bends="selectedWire.bends"
        />
        <rect
          v-if="gesture?.type === 'item' && gesture.ghost"
          :x="gesture.ghost.x"
          :y="gesture.ghost.y"
          :width="gesture.ghost.w"
          :height="gesture.ghost.h"
          :class="gesture.ghost.copy ? 'ghost-copy' : 'ghost-invalid'"
          :data-testid="gesture.ghost.copy ? 'copy-ghost' : 'invalid-ghost'"
          pointer-events="none"
        />
        <polyline
          v-if="rubber"
          :points="rubber"
          fill="none"
          class="rubber"
          :style="{ stroke: rubberColour }"
          pointer-events="none"
        />
      </g>
    </svg>
    <div class="zoom" role="group" :aria-label="t('editor.canvas.zoom')">
      <v-btn
        type="button"
        size="small"
        :aria-label="t('editor.canvas.zoomIn')"
        @click="zoomButton(0.8)"
      >
        +
      </v-btn>
      <v-btn
        type="button"
        size="small"
        :aria-label="t('editor.canvas.zoomOut')"
        @click="zoomButton(1.25)"
      >
        −
      </v-btn>
      <v-btn type="button" size="small" :aria-label="t('editor.canvas.fitLabel')" @click="fitView">
        {{ t('editor.canvas.fit') }}
      </v-btn>
    </div>
    <p v-if="drawingHint || dragHint" class="hint" role="status">{{ drawingHint ?? dragHint }}</p>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  height: 100%;
}
.canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 24rem;
  background: var(--schematic-canvas);
  border: 1px solid var(--schematic-border);
  touch-action: none;
  user-select: none;
}
.canvas.drawing {
  cursor: crosshair;
}
.sheet {
  fill: var(--schematic-sheet);
  stroke: var(--schematic-border);
  stroke-width: 4;
}
.ghost-invalid {
  fill: color-mix(in srgb, var(--schematic-error) 15%, transparent);
  stroke: var(--schematic-error);
  stroke-width: 10;
  stroke-dasharray: 30 15;
}
.ghost-copy {
  fill: color-mix(in srgb, var(--schematic-selection) 15%, transparent);
  stroke: var(--schematic-selection);
  stroke-width: 10;
  stroke-dasharray: 30 15;
}
.wire-hit {
  cursor: pointer;
  pointer-events: stroke;
}
.bodies.translucent {
  opacity: 0.35;
}
.row-band-rect {
  fill: color-mix(in srgb, var(--schematic-frame) 5%, transparent);
  stroke: var(--schematic-rail-edge);
  stroke-width: 4;
  stroke-dasharray: 20 12;
}
.row-band-label {
  font-size: 36px;
  fill: var(--schematic-muted);
}
.start-ring {
  fill: none;
  stroke: var(--schematic-selection);
  stroke-width: 8;
}
.rubber {
  stroke: var(--schematic-selection);
  stroke-width: 10;
  stroke-dasharray: 30 20;
}
.zoom {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.25rem;
}
.hint {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  margin: 0;
  padding: 0.25rem 0.6rem;
  background: var(--schematic-sheet);
  border: 1px solid var(--schematic-border);
  border-radius: 4px;
}
</style>
