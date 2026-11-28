<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { useCountdown } from '@/composables/useCountdown'
import { isCompleteCode, normalizeCode, RESEND_COOLDOWN_SECONDS } from '@/domain/authCode'
import { safeRedirect } from '@/router/redirect'
import { t } from '@/i18n'
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
    <h1>{{ t('auth.twoFactor.title') }}</h1>
    <p>{{ t('auth.twoFactor.intro') }}</p>
    <form @submit.prevent="submit">
      <FormField
        v-model="code"
        :label="t('auth.twoFactor.code')"
        autocomplete="one-time-code"
        :errors="verify.fieldErrors.value.code"
        :normalize="normalizeCode"
      />
      <p v-if="verify.message.value" class="form-error" role="alert">{{ verify.message.value }}</p>
      <div v-if="verify.error.value?.type === 'two_factor_restart'" class="actions">
        <RouterLink :to="{ name: 'login', query: route.query }">{{
          t('auth.twoFactor.backToLogin')
        }}</RouterLink>
      </div>
      <div v-else class="actions">
        <button type="submit" :disabled="verify.pending.value || !isCompleteCode(code)">
          {{ t('common.confirm') }}
        </button>
        <button
          type="button"
          :disabled="resend.pending.value || countdown.active.value"
          @click="resendCode"
        >
          {{
            countdown.active.value
              ? t('auth.resendIn', { seconds: countdown.remaining.value })
              : t('auth.resend')
          }}
        </button>
        <RouterLink :to="{ name: 'login', query: route.query }">{{
          t('auth.twoFactor.back')
        }}</RouterLink>
      </div>
      <p v-if="resend.message.value" class="form-error" role="alert">{{ resend.message.value }}</p>
      <p v-else-if="resent" class="form-info" role="status">{{ t('auth.resent') }}</p>
    </form>
  </main>
</template>
