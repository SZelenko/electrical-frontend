<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { t } from '@/i18n'
import { safeRedirect } from '@/router/redirect'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const email = ref(auth.pendingEmail)
const password = ref('')
const { pending, fieldErrors, message, run } = useAsyncForm(['email', 'password'])

async function submit() {
  const outcome = await run(() => auth.login(email.value, password.value))
  if (outcome === 'authenticated') {
    await router.push(safeRedirect(route.query.redirect))
  } else if (outcome === 'twoFactor') {
    await router.push({ name: 'two-factor', query: route.query })
  } else if (outcome === 'verifyEmail') {
    await router.push({ name: 'verify-email' })
  }
}
</script>

<template>
  <main>
    <h1>{{ t('auth.login.title') }}</h1>
    <p v-if="auth.status === 'reloginNeeded'" role="status">
      {{ t('auth.login.relogin') }}
    </p>
    <form @submit.prevent="submit">
      <FormField
        v-model="email"
        :label="t('common.email')"
        type="email"
        autocomplete="email"
        :errors="fieldErrors.email"
      />
      <FormField
        v-model="password"
        :label="t('common.password')"
        type="password"
        autocomplete="current-password"
        :errors="fieldErrors.password"
      />
      <p v-if="message" class="form-error" role="alert">{{ message }}</p>
      <div class="actions">
        <button type="submit" :disabled="pending">
          {{ t('auth.login.submit') }}
        </button>
        <RouterLink :to="{ name: 'register' }">{{ t('auth.login.createAccount') }}</RouterLink>
      </div>
    </form>
  </main>
</template>
