<script setup lang="ts">
import { computed } from 'vue'
/** A screw-head terminal: round head with a cross slot. Decoration only (the contact hit circle is drawn above). */
const props = defineProps<{ x: number; y: number; r: number }>()
const slot = computed(() => props.r * 0.63)
</script>

<template>
  <g pointer-events="none" :transform="`rotate(30 ${x} ${y})`">
    <circle :cx="x" :cy="y" :r="r" class="head" />
    <line :x1="x - slot" :x2="x + slot" :y1="y" :y2="y" class="slot" />
    <line :x1="x" :x2="x" :y1="y - slot" :y2="y + slot" class="slot" />
  </g>
</template>

<style scoped>
.head {
  fill: var(--schematic-part);
  stroke: var(--schematic-part-edge);
  stroke-width: 4;
}
.slot {
  stroke: var(--schematic-frame);
  stroke-width: 6;
  stroke-linecap: round;
}
</style>
