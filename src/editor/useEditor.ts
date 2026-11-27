/** Editor-wide UI context (notice, wire drawing state, toolbar actions) shared by editor components. */
import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  watch,
  type InjectionKey,
} from 'vue'
import * as cmd from '@/domain/commands'
import { rowCapacity, type Pt } from '@/domain/geometry'
import { maxBusbarCount } from '@/domain/busbars'
import { DEVICE_STYLE_DEFAULTS, newDevice } from '@/domain/deviceStyles'
import { firstFreeOffset, firstFreeRowOffset } from '@/domain/placement'
import {
  ATS_MIN_WIDTH,
  DEFAULT_RAIL_SPACING_MM,
  MAX_INPUT_CABLES,
  MAX_OUTPUT_CABLES,
  MAX_RAILS,
  MAX_ROW_BLOCKS,
  MAX_WIRES,
  MAX_BUSBARS_PER_RAIL,
  MIN_BUSBAR_COUNT,
} from '@/domain/limits'
import type {
  BusbarType,
  DeviceStyle,
  Endpoint,
  PanelContent,
  PanelElement,
  Rail,
  WireColour,
  WireCrossSection,
} from '@/domain/panelContent'
import type { ItemRef } from '@/domain/validateContent'
import { usePanelEditorStore } from '@/stores/panelEditor'
import { rejectionText, removedWiresText } from './messages'
import { newId } from './newId'

export interface Notice {
  text: string
  tone: 'info' | 'error'
}

const TRANSLUCENT_KEY = 'electrical.editor.translucent'

function readTranslucent(): boolean {
  try {
    return localStorage.getItem(TRANSLUCENT_KEY) === '1'
  } catch {
    return false
  }
}

export function createEditorContext() {
  const store = usePanelEditorStore()
  const notice = ref<Notice | null>(null)
  /** A wire being drawn: start contact, bends placed so far (tenths of mm) and its default colour. */
  const drawing = shallowRef<{
    start: Endpoint
    bends: Pt[]
    colour: WireColour
    /** The content the drawing started on; a different content cancels it. */
    content?: PanelContent
  } | null>(null)
  const wireColour = ref<WireColour>('brown')
  const wireCrossSection = ref<WireCrossSection>('2.5')
  /** Translucent mode: bodies are see-through, wires are clickable above them, items cannot be moved. */
  const translucent = ref(readTranslucent())
  watch(translucent, (on) => {
    try {
      localStorage.setItem(TRANSLUCENT_KEY, on ? '1' : '0')
    } catch {
      // storage unavailable (private mode, blocked): the toggle just is not remembered
    }
  })
  /** Wires of the short-circuit group the user clicked in the list. */
  const focusedWires = ref<ReadonlySet<string>>(new Set())
  let timer: ReturnType<typeof setTimeout> | undefined

  // The highlighted short-circuit group ends with the selection moving elsewhere or the group going away.
  watch(
    () => store.selection,
    (sel) => {
      if (
        focusedWires.value.size > 0 &&
        !(sel?.kind === 'wire' && focusedWires.value.has(sel.id))
      ) {
        focusedWires.value = new Set()
      }
    },
  )
  watch(
    () => store.shortCircuitWires,
    (wires) => {
      if (![...focusedWires.value].some((id) => wires.has(id))) focusedWires.value = new Set()
    },
  )

  // A drawing never outlives the content it was started on; the toolbar colour recolours it.
  watch(
    () => [store.content, store.readOnly] as const,
    ([current, readOnly]) => {
      const d = drawing.value
      if (d && ((d.content && d.content !== current) || readOnly)) drawing.value = null
    },
  )
  /** Called when the user changes the toolbar colour: the wire being drawn follows it. */
  function recolourDrawing() {
    if (drawing.value) drawing.value = { ...drawing.value, colour: wireColour.value }
  }

  function say(text: string, tone: Notice['tone'] = 'info') {
    notice.value = { text, tone }
    clearTimeout(timer)
    timer = setTimeout(() => (notice.value = null), 8000)
  }
  onBeforeUnmount(() => clearTimeout(timer))

  /** Applies a command as one history entry; reports rejections and cascades. */
  let quiet = 0
  /** Runs `fn` without reporting `notFound` rejections (a pending edit of an item deleted elsewhere). */
  function quietly(fn: () => void) {
    quiet++
    try {
      fn()
    } finally {
      quiet--
    }
  }

  function run(command: cmd.Command, label: string): cmd.CommandOutcome {
    const outcome = store.apply(command, label)
    if (!outcome.ok && outcome.reason === 'notFound' && quiet > 0) return outcome
    if (!outcome.ok) say(rejectionText(outcome.reason, outcome.detail), 'error')
    else if (outcome.removedWires > 0) say(removedWiresText(outcome.removedWires))
    return outcome
  }

  const content = computed<PanelContent | null>(() => store.content)

  /** The rail new devices go to: selected rail / rail of the selected item / first rail. */
  const targetRail = computed<Rail | null>(() => {
    const c = content.value
    const idx = store.index
    if (!c || !idx) return null
    const sel = store.selection
    if (sel?.kind === 'rail') return idx.rails.get(sel.id)?.rail ?? null
    if (sel?.kind === 'element') return idx.elements.get(sel.id)?.rail ?? null
    if (sel?.kind === 'busbar') return idx.busbars.get(sel.id)?.rail ?? null
    if (sel?.kind === 'block') return idx.blocks.get(sel.id)?.rail ?? c.rails[0] ?? null
    return c.rails[0] ?? null
  })

  const disabledReason = computed(() => {
    const c = content.value
    const base = !c
      ? 'Щит не завантажено'
      : store.readOnly
        ? 'Щит доступний лише для читання'
        : null
    const device = base ?? (targetRail.value ? null : 'Спочатку додайте рейку')
    const space = (width: number) =>
      device ??
      (c &&
      targetRail.value &&
      firstFreeOffset(targetRail.value, c.railWidthModules, width) === null
        ? 'На рейці немає вільного місця'
        : null)
    return {
      rail:
        base ?? (c && c.rails.length >= MAX_RAILS ? `Досягнуто ліміт: ${MAX_RAILS} рейок` : null),
      breaker: space(1),
      rcd: space(2),
      voltageRelay: space(2),
      ats: space(ATS_MIN_WIDTH),
      block: space(1),
      rowBlock:
        base ??
        (c && c.terminalRow.length >= MAX_ROW_BLOCKS
          ? `Досягнуто ліміт: ${MAX_ROW_BLOCKS} клемників у рядку`
          : c && firstFreeRowOffset(c.terminalRow, rowCapacity(c), 1) === null
            ? 'У рядку немає вільного місця'
            : null),
      inputCable:
        base ??
        (c && c.inputCables.length >= MAX_INPUT_CABLES
          ? `Досягнуто ліміт: ${MAX_INPUT_CABLES} кабелів`
          : null),
      outputCable:
        base ??
        (c && c.outputCables.length >= MAX_OUTPUT_CABLES
          ? `Досягнуто ліміт: ${MAX_OUTPUT_CABLES} кабелів`
          : null),
      wire:
        base ??
        (c && c.wires.length >= MAX_WIRES ? `Досягнуто ліміт: ${MAX_WIRES} проводів` : null),
      busbar: busbarReason(base),
      edit: base,
    }
  })

  /** The device a busbar would be anchored at: the selected device. */
  const busbarAnchor = computed(() => {
    const sel = store.selection
    const found = sel?.kind === 'element' ? store.index?.elements.get(sel.id) : undefined
    return found?.element.kind === 'device' ? found : null
  })

  function busbarReason(base: string | null): string | null {
    if (base) return base
    const anchor = busbarAnchor.value
    if (!anchor) return 'Виберіть апарат, з якого починається шина'
    if (anchor.rail.busbars.length >= MAX_BUSBARS_PER_RAIL) {
      return `Досягнуто ліміт: ${MAX_BUSBARS_PER_RAIL} шин на рейці`
    }
    return maxBusbarCount(anchor.rail, anchor.element.id) < MIN_BUSBAR_COUNT
      ? 'Праворуч від апарата немає вільного суміжного апарата'
      : null
  }

  function addRail() {
    const id = newId()
    const outcome = run(cmd.addRail({ id, spacingMm: DEFAULT_RAIL_SPACING_MM }), 'Додати рейку')
    if (outcome.ok) store.select({ kind: 'rail', id })
  }

  function addDevice(style: DeviceStyle) {
    const rail = targetRail.value
    const width = DEVICE_STYLE_DEFAULTS[style].widthModules
    const offset =
      rail && content.value ? firstFreeOffset(rail, content.value.railWidthModules, width) : null
    if (!rail || offset === null) return say('На рейці немає вільного місця', 'error')
    const id = newId()
    if (
      run(
        cmd.addElement(rail.id, newDevice(style, id, offset)),
        DEVICE_STYLE_DEFAULTS[style].addLabel,
      ).ok
    )
      store.select({ kind: 'element', id })
  }

  function addAts() {
    const rail = targetRail.value
    const offset =
      rail && content.value
        ? firstFreeOffset(rail, content.value.railWidthModules, ATS_MIN_WIDTH)
        : null
    if (!rail || offset === null) return say('На рейці немає вільного місця', 'error')
    const id = newId()
    const element: PanelElement = {
      kind: 'ats',
      style: null,
      id,
      offsetModules: offset,
      widthModules: ATS_MIN_WIDTH,
      label: '',
      marking: '',
      sidesSwapped: false,
      state: 'A',
      on: null,
      poles: null,
    }
    if (run(cmd.addElement(rail.id, element), 'Додати АВР').ok)
      store.select({ kind: 'element', id })
  }

  function addBlock() {
    const rail = targetRail.value
    const offset =
      rail && content.value ? firstFreeOffset(rail, content.value.railWidthModules, 1) : null
    if (!rail || offset === null) return say('На рейці немає вільного місця', 'error')
    const id = newId()
    const block = {
      id,
      offsetModules: offset,
      widthModules: 1,
      terminalCount: 2,
      colour: null,
      label: '',
    }
    if (run(cmd.addBlock(rail.id, block), 'Додати клемний блок').ok)
      store.select({ kind: 'block', id })
  }

  function addRowBlock() {
    const c = content.value
    const offset = c ? firstFreeRowOffset(c.terminalRow, rowCapacity(c), 1) : null
    if (offset === null) return say('У рядку немає вільного місця', 'error')
    const id = newId()
    const block = {
      id,
      offsetModules: offset,
      widthModules: 1,
      terminalCount: 2,
      colour: null,
      label: '',
    }
    if (run(cmd.addRowBlock(block), 'Додати клемник у рядок').ok)
      store.select({ kind: 'block', id })
  }

  function addBusbar(type: BusbarType) {
    const anchor = busbarAnchor.value
    if (!anchor) return say('Виберіть апарат, з якого починається шина', 'error')
    const id = newId()
    const outcome = run(
      cmd.addBusbar({ id, type, firstElementId: anchor.element.id }),
      type === 'LN' ? 'Додати шину L+N' : 'Додати шину L',
    )
    if (outcome.ok) store.select({ kind: 'busbar', id })
  }

  function addInputCable() {
    const id = newId()
    if (run(cmd.addInputCable(cmd.defaultInputCable(id, newId())), 'Додати вхідний кабель').ok) {
      store.select({ kind: 'inputCable', id })
    }
  }

  function addOutputCable() {
    const id = newId()
    if (run(cmd.addOutputCable(cmd.defaultOutputCable(id, newId())), 'Додати вихідний кабель').ok) {
      store.select({ kind: 'outputCable', id })
    }
  }

  function removeCommandFor(ref: ItemRef): { command: cmd.Command; label: string } {
    switch (ref.kind) {
      case 'rail':
        return { command: cmd.removeRail(ref.id), label: 'Видалити рейку' }
      case 'element':
        return { command: cmd.removeElement(ref.id), label: 'Видалити апарат' }
      case 'block':
        return { command: cmd.removeBlock(ref.id), label: 'Видалити клемний блок' }
      case 'busbar':
        return { command: cmd.removeBusbar(ref.id), label: 'Видалити шину' }
      case 'inputCable':
        return { command: cmd.removeInputCable(ref.id), label: 'Видалити вхідний кабель' }
      case 'outputCable':
        return { command: cmd.removeOutputCable(ref.id), label: 'Видалити вихідний кабель' }
      case 'cableWire':
        return { command: cmd.removeCableWire(ref.id), label: 'Видалити провід кабелю' }
      case 'wire':
        return { command: cmd.removeWire(ref.id), label: 'Видалити провід' }
    }
  }

  function deleteSelected() {
    const ref = store.selection
    if (!ref) return
    const { command, label } = removeCommandFor(ref)
    run(command, label)
  }

  function removeLastBend() {
    const d = drawing.value
    if (d && d.bends.length > 0) drawing.value = { ...d, bends: d.bends.slice(0, -1) }
  }

  function cancelDrawing() {
    drawing.value = null
  }

  /** While a wire is drawn undo only steps the drawing back (history is untouched); redo is ignored. */
  function undo() {
    const d = drawing.value
    if (d) {
      if (d.bends.length > 0) removeLastBend()
      else cancelDrawing()
      return
    }
    store.undo()
  }
  function redo() {
    if (drawing.value) return
    store.redo()
  }

  return {
    store,
    notice,
    say,
    run,
    quietly,
    drawing,
    wireColour,
    wireCrossSection,
    translucent,
    focusedWires,
    disabledReason,
    addRail,
    addDevice,
    addAts,
    addBlock,
    addRowBlock,
    addBusbar,
    addInputCable,
    addOutputCable,
    deleteSelected,
    cancelDrawing,
    removeLastBend,
    recolourDrawing,
    undo,
    redo,
  }
}

export type EditorContext = ReturnType<typeof createEditorContext>
const KEY: InjectionKey<EditorContext> = Symbol('editorContext')

export function provideEditorContext(): EditorContext {
  const ctx = createEditorContext()
  provide(KEY, ctx)
  return ctx
}

/** The context when a provider exists (the generic field components also work standalone). */
export function tryEditorContext(): EditorContext | null {
  return inject(KEY, null)
}

export function useEditorContext(): EditorContext {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('Editor context is not provided')
  return ctx
}
