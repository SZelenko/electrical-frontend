<script setup lang="ts">
import { computed, onBeforeUnmount, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRouter } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import StatusNote from '@/components/StatusNote.vue'
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
    <nav class="d-flex flex-wrap ga-3 align-center mb-2" :aria-label="t('common.navigation')">
      <RouterLink :to="{ name: 'home' }">{{ t('panels.myPanels') }}</RouterLink>
    </nav>

    <p v-if="loading">{{ t('common.loading') }}</p>
    <v-alert v-else-if="notFound" type="error" variant="tonal" density="compact">
      {{ t('panels.view.notFound') }}
    </v-alert>
    <template v-else-if="hasPanel || deleted">
      <StatusNote v-if="editor.deletedAt" tone="info" class="mb-2">
        {{ t('panels.view.inTrash') }}
      </StatusNote>
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
        <div class="d-flex flex-wrap ga-3 align-center">
          <v-btn type="button" @click="renaming = true">
            {{ t('common.rename') }}
          </v-btn>
          <v-btn v-if="!editor.deletedAt" type="button" :disabled="pending" @click="remove">
            {{ t('common.delete') }}
          </v-btn>
          <v-btn
            v-if="!editor.deletedAt"
            type="button"
            class="save"
            color="primary"
            variant="flat"
            :disabled="!editor.canSave"
            :title="editor.conflict ? t('panels.view.conflictSaveTitle') : undefined"
            @click="save"
          >
            {{ editor.saving ? t('panels.view.saving') : t('common.save') }}
          </v-btn>
          <span
            v-if="!editor.deletedAt"
            class="dirty text-medium-emphasis"
            :class="{ on: editor.dirty }"
            role="status"
          >
            {{ editor.dirty ? t('panels.view.dirty') : t('panels.view.clean') }}
          </span>
        </div>
      </template>
      <v-alert v-if="message" type="error" variant="tonal" density="compact" class="mb-3">
        {{ message }}
      </v-alert>

      <template v-if="hasPanel">
        <StatusNote
          v-if="ctx.notice.value"
          :tone="ctx.notice.value.tone === 'error' ? 'error' : 'info'"
          class="notice my-2"
        >
          {{ ctx.notice.value.text }}
        </StatusNote>

        <v-alert
          v-if="editor.conflict && conflictAcknowledged"
          type="error"
          variant="tonal"
          density="compact"
          class="conflict-banner mb-3"
        >
          {{ t('panels.view.conflictBanner') }}
          <v-btn type="button" :disabled="reloading" @click="reloadDiscard">
            {{ t('panels.view.reloadDiscard') }}
          </v-btn>
        </v-alert>
        <v-alert v-if="errorText" type="error" variant="tonal" density="compact" class="mb-3">
          {{ errorText }}
        </v-alert>
        <v-alert
          v-if="editor.generalViolations.length"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ t('panels.view.serverRejected') }}
          <ul>
            <li v-for="v in editor.generalViolations" :key="v.propertyPath">
              {{ v.propertyPath }} — {{ v.details.map((d) => violationText(d, t)).join('; ') }}
            </li>
          </ul>
        </v-alert>
        <v-alert
          v-if="editor.saveError?.kind === 'validation' && editor.violationItems.size"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ t('panels.view.violationsHighlighted') }}
        </v-alert>

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
                <v-btn type="button" @click="focusGroup(c.group.wireIds)">
                  {{ t('panels.view.showOnDiagram') }}
                </v-btn>
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
          <StatusNote v-else tone="success">
            {{ t('panels.view.noShortCircuits') }}
          </StatusNote>
        </section>

        <section>
          <v-btn type="button" :aria-expanded="showTable" @click="showTable = !showTable">
            {{ showTable ? t('panels.view.hideTable') : t('panels.view.showTable') }}
          </v-btn>
          <PanelSummary
            v-if="showTable && editor.content"
            :content="editor.content"
            :short-circuits="editor.shortCircuits"
          />
        </section>
      </template>
    </template>
    <v-alert v-else-if="loadFailed" type="error" variant="tonal" density="compact">
      {{ t('panels.view.loadFailed') }}
    </v-alert>

    <v-dialog
      :model-value="!!showConflictDialog"
      persistent
      max-width="28rem"
      role="alertdialog"
      aria-labelledby="conflict-title"
    >
      <v-card>
        <v-card-title id="conflict-title" class="text-wrap">
          {{ t('panels.view.conflictTitle') }}
        </v-card-title>
        <v-card-text>
          <p>{{ t('panels.view.conflictBody') }}</p>
          <v-alert v-if="reloadFailed" type="error" variant="tonal" density="compact" class="mt-3">
            {{ t('panels.view.loadFailed') }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="flex-wrap">
          <v-btn type="button" :disabled="reloading" @click="reloadDiscard">
            {{ t('panels.view.reloadDiscard') }}
          </v-btn>
          <v-btn type="button" @click="conflictAcknowledged = true">
            {{ t('panels.view.continueEditing') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </main>
</template>

<style scoped>
.editor-page {
  max-width: none;
  /* the app bar already separates the page from the top edge */
  margin-block: 0;
  padding: 0 1rem;
  /* a column as tall as the viewport under the app bar: the editor takes what is left */
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--v-layout-top, 0px));
}
.editor-page h1 {
  margin: 0.25rem 0;
}
.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  grid-template-rows: minmax(0, 1fr);
  gap: 1rem;
  flex: 1 1 0;
  min-height: 24rem;
}
@media (max-width: 60rem) {
  .editor-page {
    height: auto;
  }
  .editor-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    flex: none;
  }
  .editor-grid :deep(.canvas-wrap) {
    height: 70vh;
  }
}
.dirty.on {
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
}
.short-circuits {
  margin: 0.25rem 0;
}
</style>
