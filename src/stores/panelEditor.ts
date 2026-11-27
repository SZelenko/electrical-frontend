import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { panelsApi, type Panel } from '@/api/panels'
import { ApiError } from '@/api/problem'
import { invalidBusbarIds } from '@/domain/busbars'
import { buildIndex, type ContentIndex } from '@/domain/contentIndex'
import type { Command, CommandOutcome } from '@/domain/commands'
import { computeLayout, type Layout } from '@/domain/geometry'
import type { PanelContent, ShortCircuit } from '@/domain/panelContent'
import { checkShortCircuits, shortCircuitWireIds } from '@/domain/shortCircuit'
import { resolveViolationItem, validateContent, type ItemRef } from '@/domain/validateContent'
import { useAuthStore } from '@/stores/auth'

/** Maximum number of undo steps kept. */
export const HISTORY_LIMIT = 200

export interface HistoryEntry {
  label: string
  before: PanelContent
  after: PanelContent
}

/** A 422 violation resolved against the payload that was sent (E9). */
export interface ResolvedViolation {
  propertyPath: string
  messages: string[]
  item: ItemRef | null
}

export type SaveError =
  | { kind: 'conflict'; currentVersion: number | null }
  | { kind: 'idConflict'; message: string }
  | { kind: 'deleted' }
  | { kind: 'validation'; violations: ResolvedViolation[] }
  | { kind: 'auth' }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string }

export type SaveResult = 'saved' | 'skipped' | 'failed' | 'stale'
export type LoadResult = 'reused' | 'loaded' | 'stale'

export function itemKey(ref: ItemRef): string {
  return `${ref.kind}:${ref.id}`
}

function itemExists(index: ContentIndex, ref: ItemRef): boolean {
  switch (ref.kind) {
    case 'rail':
      return index.rails.has(ref.id)
    case 'element':
      return index.elements.has(ref.id)
    case 'block':
      return index.blocks.has(ref.id)
    case 'busbar':
      return index.busbars.has(ref.id)
    case 'inputCable':
      return index.inputCables.has(ref.id)
    case 'outputCable':
      return index.outputCables.has(ref.id)
    case 'cableWire':
      return index.cableWires.has(ref.id)
    case 'wire':
      return index.wires.has(ref.id)
  }
}

function classify(error: unknown, sent: PanelContent): SaveError {
  if (!(error instanceof ApiError)) {
    return { kind: 'unknown', message: error instanceof Error ? error.message : 'Unknown error' }
  }
  if (error.type === 'panel_version_conflict') {
    return { kind: 'conflict', currentVersion: error.currentVersion }
  }
  if (error.type === 'panel_content_id_conflict')
    return { kind: 'idConflict', message: error.message }
  if (error.status === 404) return { kind: 'deleted' }
  if (error.status === 401) return { kind: 'auth' }
  if (error.type === 'network') return { kind: 'network' }
  if (error.status === 422) {
    const violations = Object.entries(error.violations).map(([propertyPath, messages]) => ({
      propertyPath,
      messages,
      item: resolveViolationItem(sent, propertyPath),
    }))
    if (violations.length === 0) {
      violations.push({ propertyPath: '', messages: [error.message], item: null })
    }
    return { kind: 'validation', violations }
  }
  return { kind: 'unknown', message: error.message }
}

/**
 * The open panel while it is edited: immutable content with structural sharing, a command history
 * of `{label, before, after}` references, optimistic-lock save. Survives route changes while dirty.
 */
export const usePanelEditorStore = defineStore('panelEditor', () => {
  const auth = useAuthStore()

  const panelId = ref<string | null>(null)
  const ownerUserId = ref<string | null>(null)
  const name = ref('')
  const content = shallowRef<PanelContent | null>(null)
  const savedContent = shallowRef<PanelContent | null>(null)
  const baseVersion = ref(0)
  const deletedAt = ref<string | null>(null)
  const backendShortCircuits = shallowRef<ShortCircuit[] | null>(null)
  const undoStack = shallowRef<HistoryEntry[]>([])
  const redoStack = shallowRef<HistoryEntry[]>([])
  const selection = ref<ItemRef | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const saveError = ref<SaveError | null>(null)
  /** Bumped whenever the session is replaced; late responses of an older one are ignored. */
  let generation = 0

  const readOnly = computed(() => deletedAt.value !== null)
  const dirty = computed(() => content.value !== savedContent.value)
  const canUndo = computed(() => !readOnly.value && undoStack.value.length > 0)
  const canRedo = computed(() => !readOnly.value && redoStack.value.length > 0)
  const conflict = computed(() => saveError.value?.kind === 'conflict')
  const canSave = computed(
    () =>
      content.value !== null && dirty.value && !saving.value && !readOnly.value && !conflict.value,
  )
  const undoLabel = computed(() => undoStack.value[undoStack.value.length - 1]?.label ?? null)
  const redoLabel = computed(() => redoStack.value[redoStack.value.length - 1]?.label ?? null)

  const index = computed(() => (content.value ? buildIndex(content.value) : null))
  const layout = computed<Layout | null>(() =>
    content.value ? computeLayout(content.value) : null,
  )

  /** Busbars with a problem right now (highlighted live, not only after a failed save). */
  const invalidBusbars = computed(() =>
    content.value ? invalidBusbarIds(content.value) : new Set<string>(),
  )

  const localShortCircuits = computed(() =>
    content.value ? checkShortCircuits(content.value) : [],
  )
  /** The backend's answer while the content equals the saved one, otherwise the local result. */
  const shortCircuits = computed(() =>
    content.value !== null && content.value === savedContent.value && backendShortCircuits.value
      ? backendShortCircuits.value
      : localShortCircuits.value,
  )
  const shortCircuitWires = computed(() => shortCircuitWireIds(shortCircuits.value))

  const violationItems = computed(() => {
    const keys = new Set<string>()
    const error = saveError.value
    if (error?.kind !== 'validation' || !index.value) return keys
    for (const v of error.violations) {
      if (v.item && itemExists(index.value, v.item)) keys.add(itemKey(v.item))
    }
    return keys
  })
  /** Violations that cannot be tied to an item that still exists. */
  const generalViolations = computed(() => {
    const error = saveError.value
    if (error?.kind !== 'validation') return []
    const idx = index.value
    return error.violations.filter((v) => !v.item || !idx || !itemExists(idx, v.item))
  })

  function clear() {
    generation++
    panelId.value = null
    ownerUserId.value = null
    name.value = ''
    content.value = null
    savedContent.value = null
    baseVersion.value = 0
    deletedAt.value = null
    backendShortCircuits.value = null
    undoStack.value = []
    redoStack.value = []
    selection.value = null
    loading.value = false
    saving.value = false
    saveError.value = null
  }

  function adopt(panel: Panel) {
    panelId.value = panel.id
    name.value = panel.name
    content.value = panel.content
    savedContent.value = panel.content
    baseVersion.value = panel.version
    deletedAt.value = panel.deletedAt
    backendShortCircuits.value = panel.shortCircuits
    undoStack.value = []
    redoStack.value = []
    selection.value = null
    saveError.value = null
  }

  /** Opens a panel: reuses the editor state for the same panel and user, otherwise discards and loads. */
  async function load(id: string): Promise<LoadResult> {
    const userId = auth.user?.id ?? null
    if (
      userId !== null &&
      panelId.value === id &&
      ownerUserId.value === userId &&
      content.value !== null &&
      dirty.value
    ) {
      return 'reused'
    }
    clear()
    const mine = generation
    loading.value = true
    try {
      const panel = await panelsApi.get(id)
      if (mine !== generation) return 'stale'
      adopt(panel)
      ownerUserId.value = userId
      return 'loaded'
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  /** Throws away local changes and reloads the saved panel (conflict / manual reload). */
  async function reloadDiscard(): Promise<LoadResult> {
    const id = panelId.value
    if (id === null) return 'stale'
    const mine = ++generation
    loading.value = true
    try {
      const panel = await panelsApi.get(id)
      if (mine !== generation) return 'stale'
      const owner = ownerUserId.value
      adopt(panel)
      ownerUserId.value = owner
      return 'loaded'
    } finally {
      if (mine === generation) {
        loading.value = false
        saving.value = false
      }
    }
  }

  function pruneSelection() {
    const ref = selection.value
    if (ref && index.value && !itemExists(index.value, ref)) selection.value = null
  }

  function setContent(next: PanelContent) {
    content.value = next
    pruneSelection()
  }

  /** Runs a command; one history entry per applied command. Rejected or no-op commands record nothing. */
  function apply(command: Command, label: string): CommandOutcome {
    const before = content.value
    if (before === null || readOnly.value) return { ok: false, reason: 'readOnly' }
    const outcome = command(before)
    if (!outcome.ok || outcome.content === before) return outcome
    const stack = [...undoStack.value, { label, before, after: outcome.content }]
    undoStack.value =
      stack.length > HISTORY_LIMIT ? stack.slice(stack.length - HISTORY_LIMIT) : stack
    redoStack.value = []
    setContent(outcome.content)
    return outcome
  }

  function undo(): string | null {
    const entry = undoStack.value[undoStack.value.length - 1]
    if (!entry || readOnly.value) return null
    undoStack.value = undoStack.value.slice(0, -1)
    redoStack.value = [...redoStack.value, entry]
    setContent(entry.before)
    return entry.label
  }

  function redo(): string | null {
    const entry = redoStack.value[redoStack.value.length - 1]
    if (!entry || readOnly.value) return null
    redoStack.value = redoStack.value.slice(0, -1)
    undoStack.value = [...undoStack.value, entry]
    setContent(entry.after)
    return entry.label
  }

  function select(ref: ItemRef | null) {
    selection.value = ref
  }

  /**
   * One save at a time. On success the version and the saved snapshot (the exact reference that
   * was sent) are adopted; local content is never replaced by the response. An auth failure is not
   * retried here (the API client already refreshed once).
   */
  async function save(): Promise<SaveResult> {
    const id = panelId.value
    const snapshot = content.value
    if (id === null || snapshot === null || !canSave.value) return 'skipped'
    const mine = generation
    const local = validateContent(snapshot)
    if (local.length > 0) {
      // The backend would answer 422 with the same paths: show them without sending the request.
      const grouped = new Map<string, ResolvedViolation>()
      for (const v of local) {
        const existing = grouped.get(v.propertyPath)
        if (existing) existing.messages.push(v.message)
        else {
          grouped.set(v.propertyPath, {
            propertyPath: v.propertyPath,
            messages: [v.message],
            item: resolveViolationItem(snapshot, v.propertyPath),
          })
        }
      }
      const violations = [...grouped.values()]
      saveError.value = { kind: 'validation', violations }
      const first = violations.find((v) => v.item)
      if (first?.item) selection.value = first.item
      return 'failed'
    }
    saving.value = true
    saveError.value = null
    try {
      const panel = await panelsApi.saveContent(id, baseVersion.value, snapshot)
      if (mine !== generation) return 'stale'
      baseVersion.value = panel.version
      savedContent.value = snapshot
      backendShortCircuits.value = panel.shortCircuits
      name.value = panel.name
      return 'saved'
    } catch (error) {
      if (mine !== generation) return 'stale'
      const classified = classify(error, snapshot)
      saveError.value = classified
      if (classified.kind === 'validation' && index.value) {
        const first = classified.violations.find(
          (v) => v.item && itemExists(index.value as ContentIndex, v.item),
        )
        if (first?.item) selection.value = first.item
      }
      return 'failed'
    } finally {
      if (mine === generation) saving.value = false
    }
  }

  /** E11: after a rename the new version is adopted only when it directly follows the base version. */
  function noteRenamed(id: string, newName: string, version: number) {
    if (panelId.value !== id) return
    name.value = newName
    if (version === baseVersion.value + 1) baseVersion.value = version
  }

  // Logout (or a different user logging in) discards the editor state; `reloginNeeded` keeps it.
  watch(
    () => [auth.status, auth.user?.id] as const,
    ([status, userId]) => {
      if (status === 'authenticated' && saveError.value?.kind === 'auth') saveError.value = null
      if (status === 'anonymous') clear()
      else if (ownerUserId.value !== null && userId !== undefined && userId !== ownerUserId.value)
        clear()
    },
  )

  return {
    panelId,
    name,
    content,
    savedContent,
    baseVersion,
    deletedAt,
    selection,
    loading,
    saving,
    saveError,
    readOnly,
    dirty,
    canUndo,
    canRedo,
    canSave,
    conflict,
    undoLabel,
    redoLabel,
    index,
    layout,
    localShortCircuits,
    shortCircuits,
    shortCircuitWires,
    violationItems,
    invalidBusbars,
    generalViolations,
    load,
    reloadDiscard,
    apply,
    undo,
    redo,
    select,
    save,
    noteRenamed,
    clear,
  }
})
