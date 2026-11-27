<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import PanelPagination from '@/components/PanelPagination.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { formatDateTime } from '@/domain/panelContent'
import { usePanelsStore } from '@/stores/panels'

const panels = usePanelsStore()
const router = useRouter()
const { pending, message, run } = useAsyncForm()
const loaded = ref(false)
const creating = ref(false)
const renamingId = ref<string | null>(null)

onMounted(async () => {
  await run(() => panels.loadList(1))
  loaded.value = true
})

async function createPanel(name: string) {
  const panel = await panels.create(name)
  await router.push({ name: 'panel', params: { id: panel.id } })
}

function changePage(page: number) {
  void run(() => panels.loadList(page))
}

async function remove(id: string, name: string) {
  if (!window.confirm(`Перемістити щит «${name}» до кошика?`)) return
  const moved = await run(async () => {
    await panels.moveToTrash(id)
    return true
  })
  if (moved) await run(() => panels.refreshList())
}
</script>

<template>
  <main class="wide">
    <h1>Мої щити</h1>
    <nav class="actions" aria-label="Навігація">
      <button v-if="!creating" type="button" @click="creating = true">Створити щит</button>
      <RouterLink :to="{ name: 'trash' }">Кошик</RouterLink>
      <RouterLink :to="{ name: 'account' }">Акаунт</RouterLink>
    </nav>

    <PanelNameForm
      v-if="creating"
      label="Назва щита"
      submit-label="Створити"
      :action="createPanel"
      cancellable
      @cancel="creating = false"
    />

    <p v-if="message" class="form-error" role="alert">{{ message }}</p>

    <p v-if="!loaded && pending">Завантаження…</p>
    <p v-else-if="loaded && panels.items.length === 0 && !message">
      У вас ще немає щитів. Створіть перший.
    </p>
    <ul v-else class="panel-list">
      <li v-for="panel in panels.items" :key="panel.id">
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
          <RouterLink :to="{ name: 'panel', params: { id: panel.id } }">{{
            panel.name
          }}</RouterLink>
          <small>Оновлено: {{ formatDateTime(panel.updatedAt) }}</small>
          <span class="actions">
            <button type="button" @click="renamingId = panel.id">Перейменувати</button>
            <button type="button" :disabled="pending" @click="remove(panel.id, panel.name)">
              Видалити
            </button>
          </span>
        </template>
      </li>
    </ul>

    <PanelPagination :page="panels.page" :pages="panels.pages" @change="changePage" />
  </main>
</template>
