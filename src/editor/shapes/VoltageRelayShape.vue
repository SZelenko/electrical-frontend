<script setup lang="ts">
import { computed } from 'vue'
import type { ElementBox } from '@/domain/geometry'
import type { DeviceElement } from '@/domain/panelContent'
import DeviceFrame from './DeviceFrame.vue'
import ToggleZone from './ToggleZone.vue'

/** Voltage relay: a display ("220" on, "---" off), an indicator and four small buttons. */
const props = defineProps<{
  element: DeviceElement
  box: ElementBox
  selected: boolean
  violation: boolean
}>()

const cx = computed(() => props.box.x + props.box.w / 2)
const dispW = computed(() => props.box.w - 60)
const dispX = computed(() => props.box.x + 30)
const dispY = computed(() => props.box.y + 250)
const DISP_H = 140
const size = computed(() => Math.min(90, dispW.value / 2.1))
const btnW = computed(() => Math.min(64, (dispW.value - 12) / 2))
const btns = computed(() =>
  [0, 1].flatMap((row) =>
    [0, 1].map((col) => ({
      x: cx.value - btnW.value - 6 + col * (btnW.value + 12),
      y: props.box.y + 530 + row * 70,
    })),
  ),
)
const label = computed(
  () => `Перемкнути реле напруги (зараз: ${props.element.on ? 'увімкнено' : 'вимкнено'})`,
)
</script>

<template>
  <DeviceFrame :element="element" :box="box" :selected="selected" :violation="violation">
    <rect
      :x="dispX"
      :y="dispY"
      :width="dispW"
      :height="DISP_H"
      rx="8"
      class="display"
      pointer-events="none"
    />
    <text
      :x="cx"
      :y="dispY + DISP_H / 2 + size * 0.35"
      text-anchor="middle"
      class="digits"
      :class="{ on: element.on }"
      :style="{ fontSize: `${size}px` }"
      pointer-events="none"
    >
      {{ element.on ? '220' : '---' }}
    </text>
    <circle
      :cx="cx"
      :cy="dispY + DISP_H + 50"
      r="14"
      class="led"
      :class="{ on: element.on }"
      pointer-events="none"
    />
    <rect
      v-for="(b, i) in btns"
      :key="i"
      :x="b.x"
      :y="b.y"
      :width="btnW"
      :height="46"
      rx="23"
      class="button"
      pointer-events="none"
    />
    <ToggleZone
      :id="element.id"
      :x="dispX - 6"
      :y="dispY - 6"
      :width="dispW + 12"
      :height="DISP_H + 90"
      :label="label"
    />
  </DeviceFrame>
</template>

<style scoped>
.display {
  fill: #1c1f24;
}
.digits {
  font-family: monospace;
  font-weight: 700;
  fill: #6b2f2c;
  user-select: none;
}
.digits.on {
  fill: #ff5a4d;
}
.led {
  fill: #9aa3b0;
}
.led.on {
  fill: #2e9d3a;
}
.button {
  fill: #f1f3f6;
  stroke: #8d96a3;
  stroke-width: 4;
}
</style>
