<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import {
  moveBend,
  moveItem,
  moveRowBlock,
  copyItem,
  toggleElement,
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
  ROW_BLOCK_H,
  MARGIN,
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
import {
  drawingKey,
  endpointKey,
  formatInputCableLabel,
  type ContactSide,
  type Endpoint,
  type PanelContent,
} from '@/domain/panelContent'
import type { ItemRef } from '@/domain/validateContent'
import BendHandles from './BendHandles.vue'
import AtsShape from './shapes/AtsShape.vue'
import CableRow from './CableRow.vue'
import { deviceShapes } from './shapes/registry'
import ItemContacts from './ItemContacts.vue'
import RailShape from './RailShape.vue'
import RowBlockShape from './RowBlockShape.vue'
import TerminalBlockShape from './TerminalBlockShape.vue'
import WirePath from './WirePath.vue'
import { rejectionText } from './messages'
import { newId } from './newId'
import { useEditorContext } from './useEditor'
import { useViewport } from './useViewport'
import { MAX_BENDS_PER_WIRE, MAX_TOTAL_BENDS, MAX_WIRES, ROW_WIDTH_MODULES } from '@/domain/limits'
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
  return (g?.type === 'item' && g.preview) || store.content
})
const layout = computed<Layout | null>(() => {
  const g = gesture.value
  if (g?.type === 'item' && g.preview) return computeLayout(g.preview)
  return store.layout
})

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

const cableTitles = computed(() => {
  const titles: Record<string, string> = {}
  for (const c of content.value?.inputCables ?? [])
    titles[c.id] = `Вхідний кабель: ${formatInputCableLabel(c)}`
  for (const c of content.value?.outputCables ?? [])
    titles[c.id] = `Вихідний кабель${c.description ? `: ${c.description}` : ''}`
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
      ctx.say(rejectionText('limit', 'wires'), 'error')
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
    ctx.say('Забагато зламів: вирівняйте останній злам із виводом або приберіть злам.', 'error')
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
    'Додати провід',
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
    ctx.say(
      `Досягнуто ліміт зламів проводу (${MAX_BENDS_PER_WIRE}). Завершіть провід на виводі.`,
      'error',
    )
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
    (kind === 'rail' || kind === 'inputCable' || kind === 'outputCable' || kind === 'wire')
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
  if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 4) return
  lastItemPoint = u
  dragItem(g, u, e.ctrlKey || e.metaKey)
}

/** Last pointer position (drawing units) of an item drag, for re-evaluating it when Ctrl/Cmd changes. */
let lastItemPoint: Pt | null = null

function dragItem(g: Extract<Gesture, { type: 'item' }>, u: Pt, copy: boolean) {
  const c = store.content
  const l = store.layout
  if (!c || !l) return
  const item = g.kind === 'element' ? l.elements.get(g.id) : l.blocks.get(g.id)
  if (!item) return
  const offset = snapOffset(u.x - g.grabDx)
  const inRow = inRowBand(l, u.y)
  const railIndex = g.row && inRow ? null : railAtY(l, u.y)
  const rail = railIndex === null ? null : c.rails[railIndex]
  const target: Target | null = rail
    ? { railId: rail.id, offset }
    : inRow
      ? { row: true, offset }
      : null
  const same =
    g.moved &&
    g.copy === copy &&
    g.target?.offset === offset &&
    (g.target && 'railId' in g.target ? g.target.railId : null) ===
      (target && 'railId' in target ? target.railId : null) &&
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
          ? 'Перетягніть у рядок клемників'
          : 'Перетягніть на рейку'
        : g.row
          ? 'Клемник рядка не можна перенести на рейку'
          : 'Елемент рейки не можна перенести в рядок клемників',
      preview: null,
      ghost: pointerGhost,
    }
    return
  }
  const outcome = dropCommand(g, target, copy)(c)
  const spot: Ghost =
    'row' in target
      ? { x: MARGIN + offset * MODULE, y: l.rowTop, w: widthModules * MODULE, h: ROW_BLOCK_H, copy }
      : {
          x: MARGIN + offset * MODULE,
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
    error: outcome.ok ? null : rejectionText(outcome.reason, outcome.detail),
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
  if (copy) return copyItem(g.id, g.copyId, 'row' in target ? { row: true } : target, target.offset)
  if ('row' in target) return moveRowBlock(g.id, target.offset)
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
      ctx.run(toggleElement(g.id), 'Перемкнути')
    }
  } else if (g.type === 'item' && g.moved) {
    // the modifier is read at the drop, not at the start of the drag
    const copy = e.ctrlKey || e.metaKey
    const content = store.content
    const check = g.target && content ? dropCommand(g, g.target, copy)(content) : null
    if (!g.target || !check || !check.ok) {
      const reason =
        g.error ?? (check && !check.ok ? rejectionText(check.reason, check.detail) : 'Не вдалося')
      ctx.say(
        copy ? `${reason}. Копію не створено.` : `${reason}. Елемент повернено на місце.`,
        'error',
      )
      return
    }
    const outcome = ctx.run(
      dropCommand(g, g.target, copy),
      copy ? 'Копіювати' : g.kind === 'element' ? 'Перемістити апарат' : 'Перемістити клемний блок',
    )
    if (outcome.ok && copy) store.select({ kind: g.kind, id: g.copyId })
  } else if (g.type === 'bend' && g.moved) {
    ctx.run(moveBend(g.wireId, g.k, g.to), 'Перемістити злам')
  }
}

function onModifierKey(e: KeyboardEvent) {
  if (e.key !== 'Control' && e.key !== 'Meta') return
  const g = gesture.value
  if (g?.type !== 'item' || !g.moved || !lastItemPoint) return
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
    ctx.run(removeBend(hit.dataset.wireId, Number(hit.dataset.index)), 'Видалити злам')
  } else if (hit.dataset.kind === 'wire' && hit.dataset.id) {
    const u = units(e)
    const l = store.layout
    const wire = store.index?.wires.get(hit.dataset.id)?.wire
    if (!u || !l || !wire) return
    const a = endpointPoint(l, wire.start)
    const b = endpointPoint(l, wire.end)
    if (!a || !b) return
    const segment = nearestSegment({ start: a, end: b, bends: wire.bends }, u)
    ctx.run(insertBend(wire.id, segment, u), 'Додати злам')
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

const drawingHint = computed(() =>
  ctx.drawing.value
    ? 'Клацайте на полі, щоб додати злам, і на виводі, щоб завершити провід. Backspace або Ctrl+Z — прибрати останній злам, Esc — скасувати.'
    : null,
)
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
      aria-label="Схема щита"
      data-testid="panel-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @dblclick="onDblClick"
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
        <g class="row-band" pointer-events="none" data-testid="terminal-row">
          <rect
            :x="MARGIN"
            :y="layout.rowTop"
            :width="ROW_WIDTH_MODULES * MODULE"
            :height="ROW_BLOCK_H"
            class="row-band-rect"
          />
          <text :x="MARGIN + 20" :y="layout.rowTop - 20" class="row-band-label">
            Рядок клемників
          </text>
        </g>
        <CableRow
          layer="body"
          :boxes="layout.inputBoxes"
          kind="input"
          :selected-id="selectedCable('inputCable')"
          :violation-ids="violationIds"
          :titles="cableTitles"
        />
        <CableRow
          layer="body"
          :boxes="layout.outputBoxes"
          kind="output"
          :selected-id="selectedCable('outputCable')"
          :violation-ids="violationIds"
          :titles="cableTitles"
        />
        <RowBlockShape
          v-for="block in content.terminalRow"
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
              :is="deviceShapes[element.style]"
              v-else
              :element="element"
              :box="layout.elements.get(element.id)!"
              :selected="selectedId('element') === element.id"
              :violation="violationIds.has(element.id)"
            />
          </template>
        </template>
        <WirePath
          v-for="{ wire, d } in wireData"
          :key="wire.id"
          :wire="wire"
          :d="bendDrag?.id === wire.id ? bendDrag.d : d"
          :selected="selectedId('wire') === wire.id"
          :short-circuit="store.shortCircuitWires.has(wire.id)"
          :focused="ctx.focusedWires.value.has(wire.id)"
          :violation="violationIds.has(wire.id)"
        />
        <!-- contacts are drawn above the wires so they stay clickable -->
        <CableRow
          layer="contacts"
          :boxes="layout.inputBoxes"
          kind="input"
          :selected-id="null"
          :violation-ids="violationIds"
          :titles="cableTitles"
        />
        <CableRow
          layer="contacts"
          :boxes="layout.outputBoxes"
          kind="output"
          :selected-id="null"
          :violation-ids="violationIds"
          :titles="cableTitles"
        />
        <ItemContacts
          v-for="block in content.terminalRow"
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
          />
        </template>
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
    <div class="zoom" role="group" aria-label="Масштаб">
      <button type="button" aria-label="Збільшити" @click="zoomButton(0.8)">+</button>
      <button type="button" aria-label="Зменшити" @click="zoomButton(1.25)">−</button>
      <button type="button" aria-label="Вписати схему у вікно" @click="fitView">Вписати</button>
    </div>
    <p v-if="drawingHint || dragHint" class="hint" role="status">{{ drawingHint ?? dragHint }}</p>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
}
.canvas {
  display: block;
  width: 100%;
  height: 70vh;
  min-height: 24rem;
  background: #f4f6f9;
  border: 1px solid #c3cad4;
  touch-action: none;
  user-select: none;
}
.canvas.drawing {
  cursor: crosshair;
}
.sheet {
  fill: #fff;
  stroke: #d3d9e2;
  stroke-width: 4;
}
.ghost-invalid {
  fill: rgb(176 0 32 / 0.15);
  stroke: #b00020;
  stroke-width: 10;
  stroke-dasharray: 30 15;
}
.ghost-copy {
  fill: rgb(10 100 214 / 0.15);
  stroke: #0a64d6;
  stroke-width: 10;
  stroke-dasharray: 30 15;
}
.row-band-rect {
  fill: rgb(61 107 69 / 0.05);
  stroke: #9db3a1;
  stroke-width: 4;
  stroke-dasharray: 20 12;
}
.row-band-label {
  font-size: 36px;
  fill: #6b7a90;
}
.start-ring {
  fill: none;
  stroke: #0a64d6;
  stroke-width: 8;
}
.rubber {
  stroke: #0a64d6;
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
.zoom button {
  padding: 0.25rem 0.6rem;
}
.hint {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  margin: 0;
  padding: 0.25rem 0.6rem;
  background: #fff;
  border: 1px solid #c3cad4;
  border-radius: 4px;
}
</style>
