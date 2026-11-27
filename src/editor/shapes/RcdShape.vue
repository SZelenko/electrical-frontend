<script setup lang="ts">
import { computed } from 'vue'
import type { ElementBox } from '@/domain/geometry'
import type { DeviceElement } from '@/domain/panelContent'
import DeviceFrame from './DeviceFrame.vue'
import ToggleZone from './ToggleZone.vue'

/** Residual-current device: a lever (up = on) and a round test button "T". */
const props = defineProps<{
  element: DeviceElement
  box: ElementBox
  selected: boolean
  violation: boolean
}>()

const cx = computed(() => props.box.x + props.box.w / 2)
const slotW = computed(() => Math.min(props.box.w * 0.4, 80))
const slotY = computed(() => props.box.y + 270)
const SLOT_H = 240
const LEVER_H = 120
const leverY = computed(() => (props.element.on ? slotY.value : slotY.value + SLOT_H - LEVER_H))
const buttonY = computed(() => props.box.y + 620)
const label = computed(
  () => `Перемкнути ПЗВ (зараз: ${props.element.on ? 'увімкнено' : 'вимкнено'})`,
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
      :y="leverY + LEVER_H / 2 + 13"
      class="glyph"
      text-anchor="middle"
      pointer-events="none"
    >
      {{ element.on ? 'I' : 'O' }}
    </text>
    <circle :cx="cx" :cy="buttonY" r="38" class="test-button" pointer-events="none" />
    <text :x="cx" :y="buttonY + 13" class="glyph t" text-anchor="middle" pointer-events="none"
      >T</text
    >
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
.test-button {
  fill: #f2c200;
  stroke: #8a6d00;
  stroke-width: 4;
}
.glyph {
  font-size: 36px;
  font-weight: 700;
  fill: #fff;
  user-select: none;
}
.glyph.t {
  fill: #1f2733;
}
</style>
