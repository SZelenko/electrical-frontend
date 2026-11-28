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
    <nav class="actions" :aria-label="t('common.navigation')">
      <RouterLink :to="{ name: 'home' }">{{ t('panels.myPanels') }}</RouterLink>
    </nav>

    <p v-if="message" class="form-error" role="alert">
      {{ message }}
      <template v-if="error?.type === 'panel_name_conflict'">
        {{ t('panels.trash.renameHint') }}</template
      >
    </p>

    <p v-if="!loaded && pending">{{ t('common.loading') }}</p>
    <p v-else-if="loaded && panels.trashItems.length === 0 && !message">
      {{ t('panels.trash.empty') }}
    </p>
    <ul v-else class="panel-list">
      <li v-for="panel in panels.trashItems" :key="panel.id">
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
          <strong>{{ panel.name }}</strong>
          <small v-if="panel.deletedAt">{{
            t('panels.trash.deleted', { date: formatDateTime(panel.deletedAt, locale) })
          }}</small>
          <span class="actions">
            <button type="button" :disabled="pending" @click="restore(panel.id)">
              {{ t('panels.trash.restore') }}
            </button>
            <button type="button" @click="renamingId = panel.id">
              {{ t('common.rename') }}
            </button>
            <button
              type="button"
              :disabled="pending"
              @click="removePermanently(panel.id, panel.name)"
            >
              {{ t('panels.trash.deleteForever') }}
            </button>
          </span>
        </template>
      </li>
    </ul>

    <PanelPagination :page="panels.trashPage" :pages="panels.trashPages" @change="changePage" />
  </main>
</template>
