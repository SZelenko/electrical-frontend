<script setup lang="ts">
import { computed, onBeforeUnmount, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRouter } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import PanelSummary from '@/components/PanelSummary.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { ApiError } from '@/api/problem'
import { panelsApi } from '@/api/panels'
import { describeShortCircuit, pluralUk } from '@/domain/panelContent'
import EditorToolbar from '@/editor/EditorToolbar.vue'
import PanelCanvas from '@/editor/PanelCanvas.vue'
import PropertiesPanel from '@/editor/PropertiesPanel.vue'
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
  return window.confirm('Є незбережені зміни. Залишити сторінку без збереження?')
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
  const unsaved = editor.dirty ? ' Незбережені зміни буде втрачено.' : ''
  if (!window.confirm(`Перемістити щит «${editor.name}» до кошика?${unsaved}`)) return
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
      n > 0 ? `Збережено. Увага: виявлено коротких замикань: ${n}.` : 'Збережено.',
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
        view: describeShortCircuit(editor.content!, group),
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
      return 'Конфлікт ідентифікаторів: один з елементів уже використовується в іншому щиті. Локальні зміни збережено в редакторі.'
    case 'deleted':
      return 'Щит видалено або переміщено в кошик. Збереження неможливе.'
    case 'auth':
      return 'Сесія завершилась. Увійдіть знову — зміни залишаються в редакторі, після входу їх можна зберегти.'
    case 'network':
      return 'Немає зв’язку з сервером. Спробуйте зберегти ще раз.'
    case 'unknown':
      return `Не вдалося зберегти: ${e.message}`
    default:
      return null
  }
})
const wireWord = (n: number) => pluralUk(n, 'провід', 'проводи', 'проводів')
</script>

<template>
  <main class="wide editor-page">
    <nav class="actions" aria-label="Навігація">
      <RouterLink :to="{ name: 'home' }">Мої щити</RouterLink>
    </nav>

    <p v-if="loading">Завантаження…</p>
    <p v-else-if="notFound" role="alert">Щит не знайдено.</p>
    <template v-else-if="hasPanel || deleted">
      <p v-if="editor.deletedAt" class="form-info">
        Щит знаходиться в кошику. Редагування вимкнено.
      </p>
      <PanelNameForm
        v-if="renaming"
        label="Нова назва"
        submit-label="Зберегти"
        :initial="name"
        :action="renameAction"
        cancellable
        @done="renaming = false"
        @cancel="renaming = false"
      />
      <template v-else>
        <h1>{{ name }}</h1>
        <div class="actions">
          <button type="button" @click="renaming = true">Перейменувати</button>
          <button v-if="!editor.deletedAt" type="button" :disabled="pending" @click="remove">
            Видалити
          </button>
          <button
            v-if="!editor.deletedAt"
            type="button"
            class="save"
            :disabled="!editor.canSave"
            :title="
              editor.conflict
                ? 'Щит змінено в іншому місці: збереження вимкнено до перезавантаження'
                : undefined
            "
            @click="save"
          >
            {{ editor.saving ? 'Збереження…' : 'Зберегти' }}
          </button>
          <span v-if="!editor.deletedAt" class="dirty" :class="{ on: editor.dirty }" role="status">
            {{ editor.dirty ? '● Є незбережені зміни' : 'Усі зміни збережено' }}
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
          Щит змінено в іншому місці. Збереження вимкнено.
          <button type="button" :disabled="reloading" @click="reloadDiscard">
            Завантажити останню версію (відкинути мої зміни)
          </button>
        </div>
        <p v-if="errorText" class="form-error" role="alert">{{ errorText }}</p>
        <div v-if="editor.generalViolations.length" class="form-error" role="alert">
          Сервер відхилив зміни:
          <ul>
            <li v-for="v in editor.generalViolations" :key="v.propertyPath + v.messages.join()">
              {{ v.propertyPath }} — {{ v.messages.join('; ') }}
            </li>
          </ul>
        </div>
        <p
          v-if="editor.saveError?.kind === 'validation' && editor.violationItems.size"
          class="form-error"
          role="alert"
        >
          Елементи з помилками підсвічено на схемі.
        </p>

        <EditorToolbar v-if="!editor.deletedAt" />

        <div class="editor-grid">
          <PanelCanvas />
          <PropertiesPanel />
        </div>

        <section class="short-circuits" aria-label="Короткі замикання">
          <div v-if="circuits.length" role="alert">
            <h2>Короткі замикання: {{ circuits.length }}</h2>
            <ul>
              <li v-for="(c, i) in circuits" :key="i">
                <button type="button" @click="focusGroup(c.group.wireIds)">
                  Показати на схемі
                </button>
                Джерела: {{ c.view.sources.join('; ') }}. {{ wireWord(c.view.wires.length) }}:
                {{ c.view.wires.join(', ') }}
              </li>
            </ul>
          </div>
          <p v-else class="form-info">КЗ не виявлено.</p>
        </section>

        <section>
          <button type="button" :aria-expanded="showTable" @click="showTable = !showTable">
            {{ showTable ? 'Сховати таблицю вмісту' : 'Таблиця вмісту' }}
          </button>
          <PanelSummary
            v-if="showTable && editor.content"
            :content="editor.content"
            :short-circuits="editor.shortCircuits"
          />
        </section>
      </template>
    </template>
    <p v-else-if="loadFailed" class="form-error" role="alert">Не вдалося завантажити щит.</p>

    <div
      v-if="showConflictDialog"
      class="backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <div class="dialog">
        <h2 id="conflict-title">Щит змінено в іншому місці</h2>
        <p>
          Збережена версія щита новіша за ту, яку ви редагуєте. Ваші зміни не записано, щоб нічого
          не перезаписати.
        </p>
        <p v-if="reloadFailed" class="form-error" role="alert">Не вдалося завантажити щит.</p>
        <div class="actions">
          <button type="button" :disabled="reloading" @click="reloadDiscard">
            Завантажити останню версію (відкинути мої зміни)
          </button>
          <button type="button" @click="conflictAcknowledged = true">
            Продовжити редагування (збереження вимкнено)
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
