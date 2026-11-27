<script setup lang="ts">
/** Invisible click zone that switches an element; a drag from it still moves the element. */
defineProps<{
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
}>()
</script>

<template>
  <rect
    :x="x"
    :y="y"
    :width="width"
    :height="height"
    rx="8"
    class="toggle"
    role="button"
    data-kind="toggle"
    data-testid="toggle"
    :data-id="id"
    :aria-label="label"
  >
    <title>{{ label }}</title>
  </rect>
</template>

<style scoped>
.toggle {
  fill: transparent;
  cursor: pointer;
}
.toggle:hover {
  fill: rgb(10 100 214 / 0.12);
}
</style>
