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
    <nav class="d-flex flex-wrap ga-3 align-center mb-2" :aria-label="t('common.navigation')">
      <v-btn v-if="!creating" type="button" @click="creating = true">
        {{ t('panels.home.create') }}
      </v-btn>
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

    <v-alert v-if="message" type="error" variant="tonal" density="compact" class="mb-3">
      {{ message }}
    </v-alert>

    <p v-if="!loaded && pending">{{ t('common.loading') }}</p>
    <p v-else-if="loaded && panels.items.length === 0 && !message">
      {{ t('panels.home.empty') }}
    </p>
    <v-list v-else lines="one" border rounded class="panel-list">
      <v-list-item v-for="panel in panels.items" :key="panel.id">
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
        <div v-else class="d-flex flex-wrap align-center ga-4">
          <RouterLink :to="{ name: 'panel', params: { id: panel.id } }">{{
            panel.name
          }}</RouterLink>
          <small class="text-medium-emphasis">{{
            t('panels.home.updated', { date: formatDateTime(panel.updatedAt, locale) })
          }}</small>
          <span class="d-flex flex-wrap ga-2 align-center ms-auto">
            <v-btn type="button" @click="renamingId = panel.id">
              {{ t('common.rename') }}
            </v-btn>
            <v-btn type="button" :disabled="pending" @click="remove(panel.id, panel.name)">
              {{ t('common.delete') }}
            </v-btn>
          </span>
        </div>
      </v-list-item>
    </v-list>

    <PanelPagination :page="panels.page" :pages="panels.pages" @change="changePage" />
  </main>
</template>
