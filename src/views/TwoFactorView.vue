<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { useCountdown } from '@/composables/useCountdown'
import { isCompleteCode, normalizeCode, RESEND_COOLDOWN_SECONDS } from '@/domain/authCode'
import { safeRedirect } from '@/router/redirect'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const code = ref('')
const verify = useAsyncForm(['code'])
const resend = useAsyncForm()
const countdown = useCountdown()
const resent = ref(false)

onMounted(() => countdown.start(RESEND_COOLDOWN_SECONDS))

async function submit() {
  const done = await verify.run(() => auth.submitTwoFactor(code.value).then(() => true))
  if (done) await router.push(safeRedirect(route.query.redirect))
}

async function resendCode() {
  resent.value = false
  const done = await resend.run(() => auth.resendTwoFactorCode().then(() => true))
  if (done) {
    resent.value = true
    countdown.start(RESEND_COOLDOWN_SECONDS)
  } else if (resend.error.value?.retryAfter) {
    countdown.start(resend.error.value.retryAfter)
  }
}
</script>

<template>
  <main>
    <h1>Двофакторна автентифікація</h1>
    <p>Введіть 8-символьний код, надісланий на вашу пошту.</p>
    <form @submit.prevent="submit">
      <FormField
        v-model="code"
        label="Код"
        autocomplete="one-time-code"
        :errors="verify.fieldErrors.value.code"
        :normalize="normalizeCode"
      />
      <p v-if="verify.message.value" class="form-error" role="alert">{{ verify.message.value }}</p>
      <div v-if="verify.error.value?.type === 'two_factor_restart'" class="actions">
        <RouterLink :to="{ name: 'login', query: route.query }">Повернутися до входу</RouterLink>
      </div>
      <div v-else class="actions">
        <button type="submit" :disabled="verify.pending.value || !isCompleteCode(code)">
          Підтвердити
        </button>
        <button
          type="button"
          :disabled="resend.pending.value || countdown.active.value"
          @click="resendCode"
        >
          {{
            countdown.active.value
              ? `Надіслати код ще раз (${countdown.remaining.value} с)`
              : 'Надіслати код ще раз'
          }}
        </button>
        <RouterLink :to="{ name: 'login', query: route.query }">Назад до входу</RouterLink>
      </div>
      <p v-if="resend.message.value" class="form-error" role="alert">{{ resend.message.value }}</p>
      <p v-else-if="resent" class="form-info" role="status">Новий код надіслано.</p>
    </form>
  </main>
</template>
