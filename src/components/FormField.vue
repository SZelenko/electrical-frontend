<script setup lang="ts">
import { computed, useTemplateRef, type ComponentPublicInstance } from 'vue'
const props = defineProps<{
  label: string
  type?: string
  autocomplete?: string
  /** Applied to every input; the DOM value is rewritten so rejected characters disappear. */
  normalize?: (value: string) => string
  errors?: string[]
  maxlength?: number
}>()

const hasErrors = computed(() => (props.errors?.length ?? 0) > 0)
const model = defineModel<string>({ required: true })

const field = useTemplateRef<ComponentPublicInstance>('field')

function onUpdate(raw: string | null) {
  const typed = raw ?? ''
  const value = props.normalize ? props.normalize(typed) : typed
  model.value = value
  // the model may be unchanged (a rejected character), so the DOM value is rewritten by hand
  const input = field.value?.$el.querySelector('input')
  if (input && input.value !== value) input.value = value
}
</script>

<template>
  <v-text-field
    ref="field"
    :model-value="model"
    :aria-invalid="hasErrors"
    :label="label"
    :type="type ?? 'text'"
    :autocomplete="autocomplete"
    :maxlength="maxlength"
    :error-messages="errors?.slice(0, 1)"
    variant="outlined"
    density="comfortable"
    hide-details="auto"
    class="mb-3"
    required
    @update:model-value="onUpdate"
  />
</template>
