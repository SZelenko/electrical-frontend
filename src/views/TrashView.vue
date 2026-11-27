<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import PanelPagination from '@/components/PanelPagination.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { formatDateTime } from '@/domain/panelContent'
import { usePanelsStore } from '@/stores/panels'

const panels = usePanelsStore()
const { pending, error, message, run } = useAsyncForm()
const loaded = ref(false)
const renamingId = ref<string | null>(null)

onMounted(async () => {
  await run(() => panels.loadTrash(1))
  loaded.value = true
})

function changePage(page: number) {
  void run(() => panels.loadTrash(page))
}

async function afterMutation(mutation: () => Promise<void>) {
  const done = await run(async () => {
    await mutation()
    return true
  })
  if (done) await run(() => panels.refreshTrash())
}

function restore(id: string) {
  return afterMutation(() => panels.restore(id))
}

function removePermanently(id: string, name: string) {
  if (!window.confirm(`Видалити щит «${name}» назавжди? Цю дію не можна скасувати.`)) return
  return afterMutation(() => panels.deletePermanently(id))
}
</script>

<template>
  <main class="wide">
    <h1>Кошик</h1>
    <nav class="actions" aria-label="Навігація">
      <RouterLink :to="{ name: 'home' }">Мої щити</RouterLink>
    </nav>

    <p v-if="message" class="form-error" role="alert">
      {{ message }}
      <template v-if="error?.type === 'panel_name_conflict'">
        Перейменуйте щит у кошику й відновіть його знову.</template
      >
    </p>

    <p v-if="!loaded && pending">Завантаження…</p>
    <p v-else-if="loaded && panels.trashItems.length === 0 && !message">Кошик порожній.</p>
    <ul v-else class="panel-list">
      <li v-for="panel in panels.trashItems" :key="panel.id">
        <PanelNameForm
          v-if="renamingId === panel.id"
          label="Нова назва"
          submit-label="Зберегти"
          :initial="panel.name"
          :action="(name: string) => panels.rename(panel.id, name)"
          cancellable
          @done="renamingId = null"
          @cancel="renamingId = null"
        />
        <template v-else>
          <strong>{{ panel.name }}</strong>
          <small v-if="panel.deletedAt">Видалено: {{ formatDateTime(panel.deletedAt) }}</small>
          <span class="actions">
            <button type="button" :disabled="pending" @click="restore(panel.id)">Відновити</button>
            <button type="button" @click="renamingId = panel.id">Перейменувати</button>
            <button
              type="button"
              :disabled="pending"
              @click="removePermanently(panel.id, panel.name)"
            >
              Видалити назавжди
            </button>
          </span>
        </template>
      </li>
    </ul>

    <PanelPagination :page="panels.trashPage" :pages="panels.trashPages" @change="changePage" />
  </main>
</template>
