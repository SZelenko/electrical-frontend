<script setup lang="ts" generic="V extends string | number">
/** A compact labelled select for the properties panel and toolbar (items are `{ title, value }`). */
defineProps<{
  label: string
  items: readonly { title: string; value: V }[]
  disabled?: boolean
}>()
const model = defineModel<V>({ required: true })
</script>

<template>
  <v-select
    :model-value="model"
    :label="label"
    :items="items as { title: string; value: V }[]"
    :disabled="disabled"
    class="field"
    @update:model-value="model = $event"
  />
</template>
