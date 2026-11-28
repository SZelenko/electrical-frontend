<script setup lang="ts">
import StatusNote from '@/components/StatusNote.vue'
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
        <v-alert v-if="message" type="error" variant="tonal" density="compact" class="mb-3">
          {{ message }}
        </v-alert>
        <StatusNote v-else-if="saved" tone="success" class="mb-3">
          {{ t('auth.account.saved') }}
        </StatusNote>
        <v-btn type="submit" color="primary" variant="flat" :disabled="pending">
          {{ auth.user?.twoFactorEnabled ? t('auth.account.disable') : t('auth.account.enable') }}
        </v-btn>
      </form>
    </section>

    <p class="d-flex flex-wrap ga-3 align-center">
      <RouterLink :to="{ name: 'home' }">{{ t('auth.account.toPanels') }}</RouterLink>
      <v-btn type="button" :disabled="loggingOut" @click="logout">
        {{ t('auth.account.logout') }}
      </v-btn>
    </p>
  </main>
</template>
