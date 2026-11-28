<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PanelNameForm from '@/components/PanelNameForm.vue'
import PanelPagination from '@/components/PanelPagination.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { useLocale } from '@/composables/useLocale'
import { formatDateTime } from '@/domain/panelContent'
import { t } from '@/i18n'
import { usePanelsStore } from '@/stores/panels'

const panels = usePanelsStore()
const { locale } = useLocale()
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
  if (!window.confirm(t('panels.trash.deleteForeverConfirm', { name }))) return
  return afterMutation(() => panels.deletePermanently(id))
}
</script>

<template>
  <main class="wide">
    <h1>{{ t('panels.trash.title') }}</h1>
    <nav class="d-flex flex-wrap ga-3 align-center mb-2" :aria-label="t('common.navigation')">
      <RouterLink :to="{ name: 'home' }">{{ t('panels.myPanels') }}</RouterLink>
    </nav>

    <v-alert v-if="message" type="error" variant="tonal" density="compact" class="mb-3">
      {{ message }}
      <template v-if="error?.type === 'panel_name_conflict'">
        {{ t('panels.trash.renameHint') }}</template
      >
    </v-alert>

    <p v-if="!loaded && pending">{{ t('common.loading') }}</p>
    <p v-else-if="loaded && panels.trashItems.length === 0 && !message">
      {{ t('panels.trash.empty') }}
    </p>
    <v-list v-else lines="one" border rounded class="panel-list">
      <v-list-item v-for="panel in panels.trashItems" :key="panel.id">
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
          <strong>{{ panel.name }}</strong>
          <small v-if="panel.deletedAt" class="text-medium-emphasis">{{
            t('panels.trash.deleted', { date: formatDateTime(panel.deletedAt, locale) })
          }}</small>
          <span class="d-flex flex-wrap ga-2 align-center ms-auto">
            <v-btn type="button" :disabled="pending" @click="restore(panel.id)">
              {{ t('panels.trash.restore') }}
            </v-btn>
            <v-btn type="button" @click="renamingId = panel.id">
              {{ t('common.rename') }}
            </v-btn>
            <v-btn
              type="button"
              :disabled="pending"
              @click="removePermanently(panel.id, panel.name)"
            >
              {{ t('panels.trash.deleteForever') }}
            </v-btn>
          </span>
        </div>
      </v-list-item>
    </v-list>

    <PanelPagination :page="panels.trashPage" :pages="panels.trashPages" @change="changePage" />
  </main>
</template>
