<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { codePointLength } from '@/domain/limits'
import { tryEditorContext } from '../useEditor'

/**
 * Text/number input that holds a local draft and commits once per edit session
 * (blur or Enter), never per keystroke. The draft is reset to the model afterwards, so a
 * rejected value reverts. Escape reverts without committing.
 */
const props = defineProps<{
  label: string
  modelValue: string | number
  type?: 'text' | 'number'
  /** Limit in Unicode code points (shown as a live counter; not a UTF-16 `maxlength`). */
  maxlength?: number
  min?: number
  max?: number
  step?: number | string
  disabled?: boolean
}>()
const emit = defineEmits<{ commit: [value: string] }>()

const editor = tryEditorContext()
const id = useId()
const draft = ref(String(props.modelValue))
watch(
  () => props.modelValue,
  (v) => (draft.value = String(v)),
)

async function commit() {
  if (draft.value === String(props.modelValue)) return
  emit('commit', draft.value)
  await nextTick()
  draft.value = String(props.modelValue)
}

// An edit in progress is committed when the form goes away (e.g. the selection changed).
onBeforeUnmount(() => {
  if (draft.value !== String(props.modelValue))
    (editor ? editor.quietly : (fn: () => void) => fn())(() => emit('commit', draft.value))
})

const count = computed(() => codePointLength(draft.value))

function revert() {
  draft.value = String(props.modelValue)
}
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      :value="draft"
      :type="type ?? 'text'"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      @input="draft = ($event.target as HTMLInputElement).value"
      @blur="commit"
      @keydown.enter.prevent="commit"
      @keydown.esc.stop="revert"
    />
    <small v-if="maxlength !== undefined" :class="{ over: count > maxlength }" aria-live="polite">
      {{ count }}/{{ maxlength }}
    </small>
  </div>
</template>

<style scoped>
small {
  color: #55606f;
}
small.over {
  color: #b00020;
}
</style>
