<script setup lang="ts">
import { computed, onBeforeUnmount, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRouter } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import PanelSummary from '@/components/PanelSummary.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { ApiError } from '@/api/problem'
import { panelsApi } from '@/api/panels'
import { describeShortCircuit } from '@/domain/panelContent'
import { violationText } from '@/domain/violation'
import EditorToolbar from '@/editor/EditorToolbar.vue'
import PanelCanvas from '@/editor/PanelCanvas.vue'
import PropertiesPanel from '@/editor/PropertiesPanel.vue'
import { t } from '@/i18n'
import { provideEditorContext } from '@/editor/useEditor'
import { useEditorShortcuts } from '@/editor/useEditorShortcuts'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'
import { usePanelsStore } from '@/stores/panels'

const props = defineProps<{ id: string }>()

const panels = usePanelsStore()
const editor = usePanelEditorStore()
const auth = useAuthStore()
const router = useRouter()
const ctx = provideEditorContext()
useEditorShortcuts(ctx)
const { pending, message, run } = useAsyncForm()
const renaming = ref(false)
const loading = ref(true)
const notFound = ref(false)
const loadFailed = ref(false)
const showTable = ref(false)
const conflictAcknowledged = ref(false)
const reloading = ref(false)
const reloadFailed = ref(false)
// Set after a successful soft delete so the leave guard lets the navigation through.
const deleted = ref(false)
const leavingName = ref('')

watch(
  () => props.id,
  async (id) => {
    loading.value = true
    notFound.value = false
    loadFailed.value = false
    renaming.value = false
    conflictAcknowledged.value = false
    try {
      const result = await editor.load(id)
      if (result === 'stale') return
    } catch (e) {
      if (id !== props.id) return
      if (e instanceof ApiError && e.status === 404) notFound.value = true
      else loadFailed.value = true
    }
    loading.value = false
  },
  { immediate: true },
)

const name = computed(() => (editor.content ? editor.name : leavingName.value))
const hasPanel = computed(() => editor.content !== null && editor.panelId === props.id)

// Unsaved work survives leaving the page (it is reused on return); a clean editor is dropped so
// the next visit loads the current server state.
onUnmounted(() => {
  if (deleted.value || !editor.dirty) editor.clear()
})

function confirmLeave(): boolean {
  if (!editor.dirty || deleted.value || auth.status === 'reloginNeeded') return true
  return window.confirm(t('panels.view.leaveConfirm'))
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate((to) => (to.params.id === props.id ? true : confirmLeave()))

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault()
  e.returnValue = ''
}
watch(
  () => editor.dirty,
  (dirty) => {
    if (dirty) window.addEventListener('beforeunload', onBeforeUnload)
    else window.removeEventListener('beforeunload', onBeforeUnload)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

async function remove() {
  if (!hasPanel.value) return
  const unsaved = editor.dirty ? ` ${t('panels.unsavedLost')}` : ''
  const question = t('panels.moveToTrashConfirm', { name: editor.name })
  if (!window.confirm(`${question}${unsaved}`)) return
  const done = await run(async () => {
    await panels.moveToTrash(props.id)
    return true
  })
  if (!done) return
  deleted.value = true
  leavingName.value = editor.name
  await router.push({ name: 'home' })
}

async function renameAction(newName: string) {
  const updated = await panelsApi.rename(props.id, newName)
  editor.noteRenamed(props.id, updated.name, updated.version)
}

async function save() {
  const result = await editor.save()
  if (result === 'saved') {
    conflictAcknowledged.value = false
    const n = editor.shortCircuits.length
    ctx.say(
      n > 0 ? t('panels.view.savedWithShortCircuits', { n }) : t('panels.view.saved'),
      n > 0 ? 'error' : 'info',
    )
  }
}

async function reloadDiscard() {
  reloading.value = true
  reloadFailed.value = false
  try {
    await editor.reloadDiscard()
    conflictAcknowledged.value = false
  } catch {
    reloadFailed.value = true
  } finally {
    reloading.value = false
  }
}

const circuits = computed(() =>
  editor.content
    ? editor.shortCircuits.map((group) => ({
        group,
        view: describeShortCircuit(editor.content!, group, t),
      }))
    : [],
)

function focusGroup(wireIds: string[]) {
  ctx.focusedWires.value = new Set(wireIds)
  const first = wireIds[0]
  if (first) editor.select({ kind: 'wire', id: first })
}

const showConflictDialog = computed(() => editor.conflict && !conflictAcknowledged.value)
const errorText = computed(() => {
  const e = editor.saveError
  switch (e?.kind) {
    case 'idConflict':
      return t('errors.save.idConflict')
    case 'deleted':
      return t('errors.save.deleted')
    case 'auth':
      return t('errors.save.auth')
    case 'network':
      return t('errors.save.network')
    case 'unknown':
      return t('errors.save.unknown', { message: e.message })
    default:
      return null
  }
})
</script>

<template>
  <main class="wide editor-page">
    <nav class="actions" :aria-label="t('common.navigation')">
      <RouterLink :to="{ name: 'home' }">{{ t('panels.myPanels') }}</RouterLink>
    </nav>

    <p v-if="loading">{{ t('common.loading') }}</p>
    <p v-else-if="notFound" role="alert">{{ t('panels.view.notFound') }}</p>
    <template v-else-if="hasPanel || deleted">
      <p v-if="editor.deletedAt" class="form-info">
        {{ t('panels.view.inTrash') }}
      </p>
      <PanelNameForm
        v-if="renaming"
        :label="t('panels.newName')"
        :submit-label="t('common.save')"
        :initial="name"
        :action="renameAction"
        cancellable
        @done="renaming = false"
        @cancel="renaming = false"
      />
      <template v-else>
        <h1>{{ name }}</h1>
        <div class="actions">
          <button type="button" @click="renaming = true">
            {{ t('common.rename') }}
          </button>
          <button v-if="!editor.deletedAt" type="button" :disabled="pending" @click="remove">
            {{ t('common.delete') }}
          </button>
          <button
            v-if="!editor.deletedAt"
            type="button"
            class="save"
            :disabled="!editor.canSave"
            :title="editor.conflict ? t('panels.view.conflictSaveTitle') : undefined"
            @click="save"
          >
            {{ editor.saving ? t('panels.view.saving') : t('common.save') }}
          </button>
          <span v-if="!editor.deletedAt" class="dirty" :class="{ on: editor.dirty }" role="status">
            {{ editor.dirty ? t('panels.view.dirty') : t('panels.view.clean') }}
          </span>
        </div>
      </template>
      <p v-if="message" class="form-error" role="alert">{{ message }}</p>

      <template v-if="hasPanel">
        <p v-if="ctx.notice.value" class="notice" :class="ctx.notice.value.tone" role="status">
          {{ ctx.notice.value.text }}
        </p>

        <div
          v-if="editor.conflict && conflictAcknowledged"
          class="form-error conflict-banner"
          role="alert"
        >
          {{ t('panels.view.conflictBanner') }}
          <button type="button" :disabled="reloading" @click="reloadDiscard">
            {{ t('panels.view.reloadDiscard') }}
          </button>
        </div>
        <p v-if="errorText" class="form-error" role="alert">{{ errorText }}</p>
        <div v-if="editor.generalViolations.length" class="form-error" role="alert">
          {{ t('panels.view.serverRejected') }}
          <ul>
            <li v-for="v in editor.generalViolations" :key="v.propertyPath">
              {{ v.propertyPath }} — {{ v.details.map((d) => violationText(d, t)).join('; ') }}
            </li>
          </ul>
        </div>
        <p
          v-if="editor.saveError?.kind === 'validation' && editor.violationItems.size"
          class="form-error"
          role="alert"
        >
          {{ t('panels.view.violationsHighlighted') }}
        </p>

        <EditorToolbar v-if="!editor.deletedAt" />

        <div class="editor-grid">
          <PanelCanvas />
          <PropertiesPanel />
        </div>

        <section class="short-circuits" :aria-label="t('panels.view.shortCircuitsLabel')">
          <div v-if="circuits.length" role="alert">
            <h2>{{ t('panels.view.shortCircuitsHeading', { n: circuits.length }) }}</h2>
            <ul>
              <li v-for="(c, i) in circuits" :key="i">
                <button type="button" @click="focusGroup(c.group.wireIds)">
                  {{ t('panels.view.showOnDiagram') }}
                </button>
                {{
                  t('panels.view.shortCircuitGroup', {
                    sources: c.view.sources.join('; '),
                    n: c.view.wires.length,
                    wires: c.view.wires.join(', '),
                  })
                }}
              </li>
            </ul>
          </div>
          <p v-else class="form-info">{{ t('panels.view.noShortCircuits') }}</p>
        </section>

        <section>
          <button type="button" :aria-expanded="showTable" @click="showTable = !showTable">
            {{ showTable ? t('panels.view.hideTable') : t('panels.view.showTable') }}
          </button>
          <PanelSummary
            v-if="showTable && editor.content"
            :content="editor.content"
            :short-circuits="editor.shortCircuits"
          />
        </section>
      </template>
    </template>
    <p v-else-if="loadFailed" class="form-error" role="alert">
      {{ t('panels.view.loadFailed') }}
    </p>

    <div
      v-if="showConflictDialog"
      class="backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <div class="dialog">
        <h2 id="conflict-title">{{ t('panels.view.conflictTitle') }}</h2>
        <p>{{ t('panels.view.conflictBody') }}</p>
        <p v-if="reloadFailed" class="form-error" role="alert">
          {{ t('panels.view.loadFailed') }}
        </p>
        <div class="actions">
          <button type="button" :disabled="reloading" @click="reloadDiscard">
            {{ t('panels.view.reloadDiscard') }}
          </button>
          <button type="button" @click="conflictAcknowledged = true">
            {{ t('panels.view.continueEditing') }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.editor-page {
  max-width: none;
  padding: 0 1rem;
}
.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 60rem) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}
.dirty {
  color: #55606f;
}
.dirty.on {
  color: #b35c00;
  font-weight: 600;
}
.notice {
  margin: 0.5rem 0;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  background: #e8f1fd;
}
.notice.error {
  background: #fdeaea;
  color: #b00020;
}
.backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.45);
}
.dialog {
  max-width: 28rem;
  padding: 1.25rem;
  background: #fff;
  border-radius: 6px;
}
.short-circuits {
  margin: 1rem 0;
}
</style>
