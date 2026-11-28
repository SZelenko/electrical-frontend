<script setup lang="ts">
import type { RailBox } from '@/domain/geometry'
import { t } from '@/i18n'

defineProps<{ rail: RailBox; selected: boolean; violation: boolean }>()
</script>

<template>
  <g>
    <rect
      :x="rail.x"
      :y="rail.y"
      :width="rail.w"
      :height="rail.h"
      class="rail"
      :class="{ selected, violation }"
      data-kind="rail"
      data-testid="rail"
      :data-id="rail.id"
    >
      <title>{{ t('editor.shape.rail', { n: rail.index + 1 }) }}</title>
    </rect>
    <line
      :x1="rail.x"
      :x2="rail.x + rail.w"
      :y1="rail.cy - 60"
      :y2="rail.cy - 60"
      class="groove"
      pointer-events="none"
    />
    <line
      :x1="rail.x"
      :x2="rail.x + rail.w"
      :y1="rail.cy + 60"
      :y2="rail.cy + 60"
      class="groove"
      pointer-events="none"
    />
    <text
      :x="rail.x - 20"
      :y="rail.cy + 14"
      class="rail-label"
      text-anchor="end"
      pointer-events="none"
    >
      {{ rail.index + 1 }}
    </text>
  </g>
</template>

<style scoped>
.rail {
  fill: #c9ced6;
  stroke: #8a93a0;
  stroke-width: 4;
  cursor: pointer;
}
.rail.selected {
  stroke: #0a64d6;
  stroke-width: 12;
}
.rail.violation {
  stroke: #b00020;
  stroke-width: 12;
  stroke-dasharray: 20 10;
}
.groove {
  stroke: #a3abb7;
  stroke-width: 6;
}
.rail-label {
  font-size: 40px;
  fill: #55606f;
  user-select: none;
}
</style>
