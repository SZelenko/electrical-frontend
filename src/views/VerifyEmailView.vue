<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { useCountdown } from '@/composables/useCountdown'
import { isCompleteCode, normalizeCode, RESEND_COOLDOWN_SECONDS } from '@/domain/authCode'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const email = ref(auth.pendingEmail)
const code = ref('')
const verify = useAsyncForm(['email', 'code'])
const resend = useAsyncForm()
const countdown = useCountdown()
const resent = ref(false)

// The backend has just sent a code (register / login), so resend is locked for the cooldown.
onMounted(() => countdown.start(RESEND_COOLDOWN_SECONDS))

async function submit() {
  const done = await verify.run(() => auth.verifyEmail(email.value, code.value).then(() => true))
  if (done) {
    auth.pendingEmail = email.value
    await router.push({ name: 'login' })
  }
}

async function resendCode() {
  resent.value = false
  const done = await resend.run(() => auth.resendVerificationCode(email.value).then(() => true))
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
    <h1>Підтвердження пошти</h1>
    <p>Ми надіслали 8-символьний код на вашу пошту.</p>
    <form @submit.prevent="submit">
      <FormField
        v-model="email"
        label="Електронна пошта"
        type="email"
        autocomplete="email"
        :errors="verify.fieldErrors.value.email"
      />
      <FormField
        v-model="code"
        label="Код підтвердження"
        autocomplete="one-time-code"
        :errors="verify.fieldErrors.value.code"
        :normalize="normalizeCode"
      />
      <p v-if="verify.message.value" class="form-error" role="alert">{{ verify.message.value }}</p>
      <div class="actions">
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
      </div>
      <p v-if="resend.message.value" class="form-error" role="alert">{{ resend.message.value }}</p>
      <p v-else-if="resent" class="form-info" role="status">Новий код надіслано.</p>
    </form>
  </main>
</template>
