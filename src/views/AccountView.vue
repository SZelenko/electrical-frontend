<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
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
  if (editor.dirty && !window.confirm('Є незбережені зміни щита, їх буде втрачено. Вийти?')) return
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
    <h1>Акаунт</h1>
    <p>
      Електронна пошта: <strong>{{ auth.user?.email }}</strong>
    </p>

    <section aria-labelledby="two-factor-heading">
      <h2 id="two-factor-heading">Двофакторна автентифікація</h2>
      <p>
        Двофакторна автентифікація:
        <strong>{{ auth.user?.twoFactorEnabled ? 'увімкнена' : 'вимкнена' }}</strong>
      </p>
      <form @submit.prevent="toggleTwoFactor">
        <FormField
          v-model="password"
          label="Пароль для підтвердження"
          type="password"
          autocomplete="current-password"
          :errors="fieldErrors.password"
        />
        <p v-if="message" class="form-error" role="alert">{{ message }}</p>
        <p v-else-if="saved" class="form-info" role="status">Зміни збережено.</p>
        <button type="submit" :disabled="pending">
          {{ auth.user?.twoFactorEnabled ? 'Вимкнути 2FA' : 'Увімкнути 2FA' }}
        </button>
      </form>
    </section>

    <p class="actions">
      <RouterLink :to="{ name: 'home' }">До моїх щитів</RouterLink>
      <button type="button" :disabled="loggingOut" @click="logout">Вийти</button>
    </p>
  </main>
</template>
