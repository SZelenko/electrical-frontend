<script setup lang="ts">
import { computed } from 'vue'
import type { ElementBox } from '@/domain/geometry'
import type { DeviceElement } from '@/domain/panelContent'
import DeviceFrame from './DeviceFrame.vue'
import ToggleZone from './ToggleZone.vue'

/** Circuit breaker: a lever (up = on, down = off) marked I / O. */
const props = defineProps<{
  element: DeviceElement
  box: ElementBox
  selected: boolean
  violation: boolean
}>()

const cx = computed(() => props.box.x + props.box.w / 2)
const slotW = computed(() => Math.min(props.box.w * 0.45, 90))
const slotY = computed(() => props.box.y + 290)
const LEVER_H = 150
const SLOT_H = 300
const leverY = computed(() => (props.element.on ? slotY.value : slotY.value + SLOT_H - LEVER_H))
const label = computed(
  () => `Перемкнути автомат (зараз: ${props.element.on ? 'увімкнено' : 'вимкнено'})`,
)
</script>

<template>
  <DeviceFrame :element="element" :box="box" :selected="selected" :violation="violation">
    <rect
      :x="cx - slotW / 2"
      :y="slotY"
      :width="slotW"
      :height="SLOT_H"
      rx="8"
      class="slot"
      pointer-events="none"
    />
    <rect
      :x="cx - slotW / 2 + 6"
      :y="leverY + 4"
      :width="slotW - 12"
      :height="LEVER_H - 8"
      rx="8"
      class="lever"
      :class="{ on: element.on }"
      pointer-events="none"
    />
    <text
      :x="cx"
      :y="leverY + LEVER_H / 2 + 14"
      class="glyph"
      text-anchor="middle"
      pointer-events="none"
    >
      {{ element.on ? 'I' : 'O' }}
    </text>
    <ToggleZone
      :id="element.id"
      :x="cx - slotW / 2 - 10"
      :y="slotY - 10"
      :width="slotW + 20"
      :height="SLOT_H + 20"
      :label="label"
    />
  </DeviceFrame>
</template>

<style scoped>
.slot {
  fill: #cfd4dc;
  stroke: #8d96a3;
  stroke-width: 4;
}
.lever {
  fill: #2b2f36;
}
.lever.on {
  fill: #c62828;
}
.glyph {
  font-size: 40px;
  font-weight: 700;
  fill: #fff;
  user-select: none;
}
</style>
