<script setup lang="ts">
import { computed } from 'vue'
import {
  BLOCK_GREY_HEX,
  railContactY,
  VBLOCK_INSET,
  MODULE,
  WIRE_COLOUR_HEX,
  type BlockBox,
} from '@/domain/geometry'
import { colourName, type TerminalBlock } from '@/domain/panelContent'

/** A rail terminal block: one module wide, contacts in a column, wired from the left or the right. */
const props = defineProps<{
  block: TerminalBlock
  box: BlockBox
  selected: boolean
  violation: boolean
}>()

const fill = computed(() =>
  props.block.colour ? WIRE_COLOUR_HEX[props.block.colour] : BLOCK_GREY_HEX,
)
const cx = computed(() => props.box.x + MODULE / 2)
const ys = computed(() =>
  Array.from({ length: props.block.terminalCount }, (_, k) => railContactY(props.box, k)),
)
const first = computed(() => ys.value[0] ?? props.box.y)
const last = computed(() => ys.value[ys.value.length - 1] ?? props.box.y)
const title = computed(
  () =>
    `Клемний блок${props.block.label ? ` ${props.block.label}` : ''}, клем: ${props.block.terminalCount}, колір: ${props.block.colour ? colourName(props.block.colour) : 'сірий'}`,
)
</script>

<template>
  <g>
    <rect
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="8"
      class="body"
      :class="{ selected, violation }"
      :style="{ fill }"
      data-kind="block"
      data-testid="block"
      data-block-zone="rail"
      :data-id="block.id"
    >
      <title>{{ title }}</title>
    </rect>
    <rect
      v-if="block.colour === 'green-yellow'"
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="8"
      class="stripes"
      pointer-events="none"
    />
    <line :x1="cx" :x2="cx" :y1="first" :y2="last" class="bar" pointer-events="none" />
    <g v-for="(y, i) in ys" :key="i" pointer-events="none">
      <line
        :x1="box.x + VBLOCK_INSET"
        :x2="box.x + MODULE - VBLOCK_INSET"
        :y1="y"
        :y2="y"
        class="bar"
      />
    </g>
    <text
      v-if="block.label"
      :x="cx + 22"
      :y="box.y + box.h - 40"
      class="label"
      :transform="`rotate(-90 ${cx + 22} ${box.y + box.h - 40})`"
      pointer-events="none"
    >
      {{ block.label }}
    </text>
  </g>
</template>

<style scoped>
.body {
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
.stripes {
  fill: none;
  stroke: #f2c200;
  stroke-width: 40;
  stroke-dasharray: 30 30;
}
.bar {
  stroke: #3b4658;
  stroke-width: 8;
}
.label {
  font-size: 36px;
  fill: #1f2733;
  stroke: #fff;
  stroke-width: 6px;
  paint-order: stroke;
  user-select: none;
}
</style>
