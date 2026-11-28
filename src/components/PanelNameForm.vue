<script setup lang="ts">
import { ref } from 'vue'
import FormField from '@/components/FormField.vue'
import { useAsyncForm } from '@/composables/useAsyncForm'
import { t } from '@/i18n'

const props = defineProps<{
  label: string
  submitLabel: string
  initial?: string
  /** Performs the request; a thrown ApiError is shown under the field. */
  action: (name: string) => Promise<unknown>
  cancellable?: boolean
}>()
const emit = defineEmits<{ done: []; cancel: [] }>()

const name = ref(props.initial ?? '')
const { pending, fieldErrors, message, run } = useAsyncForm(['name'])

async function submit() {
  const ok = await run(async () => {
    await props.action(name.value.trim())
    return true
  })
  if (ok) emit('done')
}
</script>

<template>
  <form class="inline-form" @submit.prevent="submit">
    <FormField v-model="name" :label="label" :errors="fieldErrors.name" :maxlength="100" />
    <p v-if="message" class="form-error" role="alert">{{ message }}</p>
    <div class="actions">
      <button type="submit" :disabled="pending">{{ submitLabel }}</button>
      <button v-if="cancellable" type="button" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>
