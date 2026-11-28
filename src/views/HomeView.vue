<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import PanelPagination from '@/components/PanelPagination.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { useLocale } from '@/composables/useLocale'
import { formatDateTime } from '@/domain/panelContent'
import { t } from '@/i18n'
import { usePanelsStore } from '@/stores/panels'

const panels = usePanelsStore()
const { locale } = useLocale()
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
  if (!window.confirm(t('panels.moveToTrashConfirm', { name }))) return
  const moved = await run(async () => {
    await panels.moveToTrash(id)
    return true
  })
  if (moved) await run(() => panels.refreshList())
}
</script>

<template>
  <main class="wide">
    <h1>{{ t('panels.myPanels') }}</h1>
    <nav class="actions" :aria-label="t('common.navigation')">
      <button v-if="!creating" type="button" @click="creating = true">
        {{ t('panels.home.create') }}
      </button>
      <RouterLink :to="{ name: 'trash' }">{{ t('panels.home.trash') }}</RouterLink>
      <RouterLink :to="{ name: 'account' }">{{ t('panels.home.account') }}</RouterLink>
    </nav>

    <PanelNameForm
      v-if="creating"
      :label="t('panels.home.nameLabel')"
      :submit-label="t('panels.home.createSubmit')"
      :action="createPanel"
      cancellable
      @cancel="creating = false"
    />

    <p v-if="message" class="form-error" role="alert">{{ message }}</p>

    <p v-if="!loaded && pending">{{ t('common.loading') }}</p>
    <p v-else-if="loaded && panels.items.length === 0 && !message">
      {{ t('panels.home.empty') }}
    </p>
    <ul v-else class="panel-list">
      <li v-for="panel in panels.items" :key="panel.id">
        <PanelNameForm
          v-if="renamingId === panel.id"
          :label="t('panels.newName')"
          :submit-label="t('common.save')"
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
          <small>{{
            t('panels.home.updated', { date: formatDateTime(panel.updatedAt, locale) })
          }}</small>
          <span class="actions">
            <button type="button" @click="renamingId = panel.id">
              {{ t('common.rename') }}
            </button>
            <button type="button" :disabled="pending" @click="remove(panel.id, panel.name)">
              {{ t('common.delete') }}
            </button>
          </span>
        </template>
      </li>
    </ul>

    <PanelPagination :page="panels.page" :pages="panels.pages" @change="changePage" />
  </main>
</template>
