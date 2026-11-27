<script setup lang="ts">
import { computed } from 'vue'
import type { ElementBox } from '@/domain/geometry'
import { terminalX } from '@/domain/geometry'
import { ATS_STATE_NAMES, type AtsElement } from '@/domain/panelContent'
import { fitText } from './fitText'
import ToggleZone from './ToggleZone.vue'

/**
 * Automatic transfer switch: two terminal groups (source A and B), a red rotary handle pointing to
 * A / 0 / B (the toggle zone) and two indicator lights. No internal conductor lines.
 */
const props = defineProps<{
  element: AtsElement
  box: ElementBox
  selected: boolean
  violation: boolean
}>()

const cx = computed(() => props.box.x + props.box.w / 2)
const w = computed(() => props.element.widthModules)
const swapped = computed(() => props.element.sidesSwapped)
const groupLabelY = computed(() =>
  swapped.value ? props.box.y + props.box.h - 70 : props.box.y + 100,
)
const groups = computed(() => [
  {
    text: 'А',
    x: (terminalX(props.box.x, w.value, 0, 4) + terminalX(props.box.x, w.value, 1, 4)) / 2,
  },
  {
    text: 'Б',
    x: (terminalX(props.box.x, w.value, 2, 4) + terminalX(props.box.x, w.value, 3, 4)) / 2,
  },
])
const handleY = computed(() => props.box.y + props.box.h / 2)
const r = computed(() => Math.min(80, props.box.w / 5))
const ANGLE = { A: -50, off: 0, B: 50 } as const
const angle = computed(() => ANGLE[props.element.state])
const stateName = computed(() => ATS_STATE_NAMES[props.element.state])
const title = computed(() => {
  const e = props.element
  return `${e.label || 'АВР'}${e.marking ? ` (${e.marking})` : ''}, ${e.widthModules} мод., стан: ${stateName.value}`
})
const label = computed(() => `Перемкнути АВР (стан: ${stateName.value})`)
const panelW = computed(() => props.box.w - 28)
</script>

<template>
  <g>
    <rect
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="10"
      class="body"
      :class="{ selected, violation }"
      data-kind="element"
      data-testid="element"
      data-element-kind="ats"
      :data-id="element.id"
    >
      <title>{{ title }}</title>
    </rect>
    <rect
      :x="box.x + 14"
      :y="box.y + 150"
      :width="panelW"
      :height="box.h - 300"
      rx="8"
      class="front"
      pointer-events="none"
    />
    <text
      v-for="g in groups"
      :key="g.text"
      :x="g.x"
      :y="groupLabelY"
      text-anchor="middle"
      class="group"
      pointer-events="none"
    >
      {{ g.text }}
    </text>
    <text
      v-if="element.marking"
      :x="cx"
      :y="box.y + 205"
      text-anchor="middle"
      class="marking"
      v-bind="fitText(element.marking, 36, panelW - 8)"
      pointer-events="none"
    >
      {{ element.marking }}
    </text>
    <g pointer-events="none" data-testid="ats-state" :data-state="element.state">
      <text :x="cx - r - 40" :y="handleY + 12" text-anchor="middle" class="pos">А</text>
      <text :x="cx" :y="handleY - r - 18" text-anchor="middle" class="pos">0</text>
      <text :x="cx + r + 40" :y="handleY + 12" text-anchor="middle" class="pos">Б</text>
      <circle :cx="cx" :cy="handleY" :r="r" class="handle" />
      <line
        :x1="cx"
        :y1="handleY"
        :x2="cx"
        :y2="handleY - r * 0.85"
        class="pointer"
        :transform="`rotate(${angle} ${cx} ${handleY})`"
      />
      <circle
        :cx="cx - 60"
        :cy="handleY + r + 60"
        r="14"
        class="led"
        :class="{ a: element.state === 'A' }"
      />
      <circle
        :cx="cx + 60"
        :cy="handleY + r + 60"
        r="14"
        class="led"
        :class="{ b: element.state === 'B' }"
      />
    </g>
    <text
      :x="cx"
      :y="box.y + box.h - 190"
      text-anchor="middle"
      class="label"
      v-bind="fitText(`АВР${element.label ? ` ${element.label}` : ''}`, 28, panelW - 8)"
      pointer-events="none"
    >
      АВР{{ element.label ? ` ${element.label}` : '' }}
    </text>
    <ToggleZone
      :id="element.id"
      :x="cx - r - 8"
      :y="handleY - r - 8"
      :width="2 * r + 16"
      :height="2 * r + 16"
      :label="label"
    />
  </g>
</template>

<style scoped>
.body {
  fill: #fafbfc;
  stroke: #3b4658;
  stroke-width: 6;
  cursor: grab;
}
.body.selected {
  stroke: #0a64d6;
  stroke-width: 14;
}
.body.violation {
  stroke: #b00020;
  stroke-dasharray: 20 10;
  stroke-width: 14;
}
.front {
  fill: #fff;
  stroke: #c9ced6;
  stroke-width: 4;
}
.group,
.pos {
  font-size: 40px;
  font-weight: 700;
  fill: #33415c;
  user-select: none;
}
.pos {
  font-size: 34px;
}
.handle {
  fill: #c62828;
  stroke: #7f1717;
  stroke-width: 5;
}
.pointer {
  stroke: #fff;
  stroke-width: 14;
  stroke-linecap: round;
}
.led {
  fill: #9aa3b0;
  stroke: #3b4658;
  stroke-width: 3;
}
.led.a {
  fill: #2e9d3a;
}
.led.b {
  fill: #2e9d3a;
}
.marking {
  font-size: 36px;
  font-weight: 600;
  fill: #1f2733;
  user-select: none;
}
.label {
  font-size: 28px;
  fill: #33415c;
  user-select: none;
}
</style>
