<script setup lang="ts">
import { computed } from 'vue'
import { BLOCK_GREY_HEX, terminalX, WIRE_COLOUR_HEX, type BlockBox } from '@/domain/geometry'
import { colourName, type TerminalBlock } from '@/domain/panelContent'

/** A terminal-row block: horizontal bar, contacts wired from the top or the bottom. */
const props = defineProps<{
  block: TerminalBlock
  box: BlockBox
  selected: boolean
  violation: boolean
}>()

const fill = computed(() =>
  props.block.colour ? WIRE_COLOUR_HEX[props.block.colour] : BLOCK_GREY_HEX,
)
const xs = computed(() =>
  Array.from({ length: props.block.terminalCount }, (_, i) =>
    terminalX(props.box.x, props.block.widthModules, i, props.block.terminalCount),
  ),
)
const midY = computed(() => props.box.y + props.box.h / 2)
const title = computed(
  () =>
    `Клемник у ряду${props.block.label ? ` ${props.block.label}` : ''}, клем: ${props.block.terminalCount}, колір: ${props.block.colour ? colourName(props.block.colour) : 'сірий'}`,
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
      data-block-zone="row"
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
    <line
      :x1="xs[0]"
      :x2="xs[xs.length - 1]"
      :y1="midY"
      :y2="midY"
      class="bar"
      pointer-events="none"
    />
    <g v-for="(x, i) in xs" :key="i" pointer-events="none">
      <line :x1="x" :x2="x" :y1="box.y" :y2="box.y + box.h" class="bar" />
    </g>
    <text
      v-if="block.label"
      :x="box.x + box.w / 2"
      :y="midY + 14"
      text-anchor="middle"
      class="label"
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
  font-size: 40px;
  fill: #1f2733;
  stroke: #fff;
  stroke-width: 6px;
  paint-order: stroke;
  user-select: none;
}
</style>
