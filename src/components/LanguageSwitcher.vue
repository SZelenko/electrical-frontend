<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { mdiClose } from '@mdi/js'
import { useLocale } from '@/composables/useLocale'
import { isLocale, t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

const { locale, locales, setLocale } = useLocale()
const auth = useAuthStore()
/** Set when the language could not be saved to the profile; it never blocks the UI. */
const notSaved = ref(false)
// a notice from a signed-in session must not outlive it
watch(
  () => auth.status,
  (status) => {
    if (status !== 'authenticated') notSaved.value = false
  },
)
const items = computed(() => locales.map((l) => ({ title: t(`common.languages.${l}`), value: l })))

async function onChange(value: unknown) {
  if (!isLocale(value)) return
  const saved = await setLocale(value)
  // null: a newer choice replaced this one, its result decides
  if (saved !== null) notSaved.value = !saved
}
</script>

<template>
  <v-select
    :model-value="locale"
    :items="items"
    :label="t('common.language')"
    :disabled="auth.status === 'unknown'"
    class="locale-select"
    data-testid="language-switcher"
    @update:model-value="onChange"
  />
  <!-- at the top, under the app bar (the bar clips its own content): it never covers the canvas -->
  <v-snackbar
    v-model="notSaved"
    :timeout="-1"
    location="top"
    color="error"
    :content-props="{ 'data-testid': 'locale-not-saved' }"
  >
    {{ t('app.localeNotSaved') }}
    <template #actions>
      <v-btn :aria-label="t('common.close')" :icon="mdiClose" @click="notSaved = false" />
    </template>
  </v-snackbar>
</template>

<style scoped>
.locale-select {
  flex: 0 0 10.5rem;
}
</style>
