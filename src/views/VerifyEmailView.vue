<script setup lang="ts">
import StatusNote from '@/components/StatusNote.vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { useCountdown } from '@/composables/useCountdown'
import { isCompleteCode, normalizeCode, RESEND_COOLDOWN_SECONDS } from '@/domain/authCode'
import { t } from '@/i18n'
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
    <h1>{{ t('auth.verifyEmail.title') }}</h1>
    <p>{{ t('auth.verifyEmail.intro') }}</p>
    <form @submit.prevent="submit">
      <FormField
        v-model="email"
        :label="t('common.email')"
        type="email"
        autocomplete="email"
        :errors="verify.fieldErrors.value.email"
      />
      <FormField
        v-model="code"
        :label="t('auth.verifyEmail.code')"
        autocomplete="one-time-code"
        :errors="verify.fieldErrors.value.code"
        :normalize="normalizeCode"
      />
      <v-alert
        v-if="verify.message.value"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
      >
        {{ verify.message.value }}
      </v-alert>
      <div class="d-flex flex-wrap ga-3 align-center">
        <v-btn
          type="submit"
          color="primary"
          variant="flat"
          :disabled="verify.pending.value || !isCompleteCode(code)"
        >
          {{ t('common.confirm') }}
        </v-btn>
        <v-btn
          type="button"
          :disabled="resend.pending.value || countdown.active.value"
          @click="resendCode"
        >
          {{
            countdown.active.value
              ? t('auth.resendIn', { seconds: countdown.remaining.value })
              : t('auth.resend')
          }}
        </v-btn>
      </div>
      <v-alert
        v-if="resend.message.value"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
      >
        {{ resend.message.value }}
      </v-alert>
      <StatusNote v-else-if="resent" tone="success" class="mb-3">
        {{ t('auth.resent') }}
      </StatusNote>
    </form>
  </main>
</template>
