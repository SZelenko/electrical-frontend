<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { isLocale, t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

const { locale, locales, setLocale } = useLocale()
const auth = useAuthStore()
/** Set when the language could not be saved to the profile; it never blocks the UI. */
const notSaved = ref(false)

async function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!isLocale(value)) return
  const saved = await setLocale(value)
  // null: a newer choice replaced this one, its result decides
  if (saved !== null) notSaved.value = !saved
}
</script>

<template>
  <span class="language-switcher">
    <label>
      {{ t('common.language') }}
      <select
        :value="locale"
        :disabled="auth.status === 'unknown'"
        data-testid="language-switcher"
        @change="onChange"
      >
        <option v-for="l in locales" :key="l" :value="l" :lang="l">
          {{ t(`common.languages.${l}`) }}
        </option>
      </select>
    </label>
    <small v-if="notSaved" class="notice-line" role="status" data-testid="locale-not-saved">
      <span class="form-error">{{ t('app.localeNotSaved') }}</span>
      <button type="button" :aria-label="t('common.close')" @click="notSaved = false">×</button>
    </small>
  </span>
</template>

<style scoped>
.language-switcher {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  max-width: 100%;
  font-size: 0.9rem;
}
label {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}
.notice-line {
  display: inline-flex;
  gap: 0.35rem;
  align-items: flex-start;
  background: #fff;
}
</style>
