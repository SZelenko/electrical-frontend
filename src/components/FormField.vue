<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{
  label: string
  type?: string
  autocomplete?: string
  /** Applied to every input; the DOM value is rewritten so rejected characters disappear. */
  normalize?: (value: string) => string
  errors?: string[]
  maxlength?: number
}>()

const model = defineModel<string>({ required: true })
const id = useId()
const errorId = `${id}-error`
function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const value = props.normalize ? props.normalize(input.value) : input.value
  input.value = value
  model.value = value
}
const hasErrors = computed(() => (props.errors?.length ?? 0) > 0)
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      :value="model"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      :aria-invalid="hasErrors"
      :aria-describedby="hasErrors ? errorId : undefined"
      required
      @input="onInput"
    />
    <p v-if="hasErrors" :id="errorId" class="field-error">{{ errors?.[0] }}</p>
  </div>
</template>
