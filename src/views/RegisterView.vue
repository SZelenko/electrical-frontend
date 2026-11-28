<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const { pending, fieldErrors, message, run } = useAsyncForm(['email', 'password'])

async function submit() {
  const done = await run(() => auth.register(email.value, password.value).then(() => true))
  if (done) await router.push({ name: 'verify-email' })
}
</script>

<template>
  <main>
    <h1>{{ t('auth.register.title') }}</h1>
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
        autocomplete="new-password"
        :errors="fieldErrors.password"
      />
      <v-alert v-if="message" type="error" variant="tonal" density="compact" class="mb-3">
        {{ message }}
      </v-alert>
      <div class="d-flex flex-wrap ga-3 align-center">
        <v-btn type="submit" color="primary" variant="flat" :disabled="pending">
          {{ t('auth.register.submit') }}
        </v-btn>
        <RouterLink :to="{ name: 'login' }">{{ t('auth.register.haveAccount') }}</RouterLink>
      </div>
    </form>
  </main>
</template>
