<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'

const auth = useAuthStore()
const editor = usePanelEditorStore()
const router = useRouter()
const password = ref('')
const { pending, fieldErrors, message, run } = useAsyncForm(['password'])
const saved = ref(false)
const loggingOut = ref(false)

async function toggleTwoFactor() {
  saved.value = false
  const enable = !auth.user?.twoFactorEnabled
  const done = await run(() => auth.setTwoFactor(enable, password.value).then(() => true))
  if (done) {
    password.value = ''
    saved.value = true
  }
}

async function logout() {
  if (editor.dirty && !window.confirm(t('auth.account.logoutConfirm'))) return
  loggingOut.value = true
  try {
    await auth.logout()
    await router.push({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <main>
    <h1>{{ t('auth.account.title') }}</h1>
    <p>
      {{ t('auth.account.email') }} <strong>{{ auth.user?.email }}</strong>
    </p>

    <section aria-labelledby="two-factor-heading">
      <h2 id="two-factor-heading">{{ t('auth.account.twoFactorHeading') }}</h2>
      <p>
        {{ t('auth.account.twoFactorStatus') }}
        <strong>{{
          auth.user?.twoFactorEnabled ? t('auth.account.enabled') : t('auth.account.disabled')
        }}</strong>
      </p>
      <form @submit.prevent="toggleTwoFactor">
        <FormField
          v-model="password"
          :label="t('auth.account.confirmPassword')"
          type="password"
          autocomplete="current-password"
          :errors="fieldErrors.password"
        />
        <p v-if="message" class="form-error" role="alert">{{ message }}</p>
        <p v-else-if="saved" class="form-info" role="status">{{ t('auth.account.saved') }}</p>
        <button type="submit" :disabled="pending">
          {{ auth.user?.twoFactorEnabled ? t('auth.account.disable') : t('auth.account.enable') }}
        </button>
      </form>
    </section>

    <p class="actions">
      <RouterLink :to="{ name: 'home' }">{{ t('auth.account.toPanels') }}</RouterLink>
      <button type="button" :disabled="loggingOut" @click="logout">
        {{ t('auth.account.logout') }}
      </button>
    </p>
  </main>
</template>
