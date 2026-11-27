<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
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
    <h1>Реєстрація</h1>
    <form @submit.prevent="submit">
      <FormField
        v-model="email"
        label="Електронна пошта"
        type="email"
        autocomplete="email"
        :errors="fieldErrors.email"
      />
      <FormField
        v-model="password"
        label="Пароль"
        type="password"
        autocomplete="new-password"
        :errors="fieldErrors.password"
      />
      <p v-if="message" class="form-error" role="alert">{{ message }}</p>
      <div class="actions">
        <button type="submit" :disabled="pending">Зареєструватися</button>
        <RouterLink :to="{ name: 'login' }">Вже є акаунт? Увійти</RouterLink>
      </div>
    </form>
  </main>
</template>
