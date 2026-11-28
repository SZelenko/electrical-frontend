<script setup lang="ts">
/**
 * Click zone that switches an element; a drag from it still moves the element. Focusable with the
 * keyboard (Enter / Space handled by the canvas); no pointer feedback when the panel is read-only.
 */
defineProps<{
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  readOnly: boolean
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
    :class="{ 'read-only': readOnly }"
    role="button"
    :tabindex="readOnly ? -1 : 0"
    :aria-disabled="readOnly"
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
  fill: color-mix(in srgb, var(--schematic-selection) 12%, transparent);
}
.toggle:focus-visible {
  outline: none;
  stroke: var(--schematic-selection);
  stroke-width: 8;
}
.toggle.read-only {
  cursor: default;
}
.toggle.read-only:hover {
  fill: transparent;
}
</style>
