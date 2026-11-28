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
  <form class="my-4" @submit.prevent="submit">
    <FormField v-model="name" :label="label" :errors="fieldErrors.name" :maxlength="100" />
    <v-alert v-if="message" type="error" variant="tonal" density="compact" class="mb-3">
      {{ message }}
    </v-alert>
    <div class="d-flex flex-wrap ga-3 align-center">
      <v-btn type="submit" color="primary" :disabled="pending">{{ submitLabel }}</v-btn>
      <v-btn v-if="cancellable" variant="text" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </v-btn>
    </div>
  </form>
</template>
