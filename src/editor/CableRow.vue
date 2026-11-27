<script setup lang="ts">
import { fitText } from './shapes/fitText'
import {
  CABLE_LABEL_INPUT_Y,
  CABLE_LABEL_INSET,
  CABLE_LABEL_OUTPUT_Y,
  WIRE_COLOUR_HEX,
  type CableBox,
} from '@/domain/geometry'

defineProps<{
  /** `body`: boxes and labels (above the wires); `contacts`: wire points (above the wires). */
  layer: 'body' | 'contacts'
  boxes: readonly CableBox[]
  kind: 'input' | 'output'
  selectedId: string | null
  violationIds: ReadonlySet<string>
  titles: Readonly<Record<string, string>>
}>()
</script>

<template>
  <g v-for="box in boxes" :key="box.id">
    <rect
      v-if="layer === 'body'"
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="12"
      class="cable-box"
      :class="{
        selected: selectedId === box.id,
        violation: violationIds.has(box.id),
      }"
      :data-kind="kind === 'input' ? 'inputCable' : 'outputCable'"
      :data-id="box.id"
      :data-testid="kind === 'input' ? 'input-cable' : 'output-cable'"
    >
      <title>{{ titles[box.id] }}</title>
    </rect>
    <text
      v-if="layer === 'body'"
      :x="box.x + box.w / 2"
      :y="kind === 'input' ? box.y + 80 : box.y + 190"
      class="cable-label"
      text-anchor="middle"
      pointer-events="none"
    >
      {{ kind === 'input' ? 'Вх' : 'Вих' }} {{ box.index + 1 }}
    </text>
    <text
      v-if="layer === 'body' && box.label"
      :x="box.x + box.w / 2"
      :y="box.y + (kind === 'input' ? CABLE_LABEL_INPUT_Y : CABLE_LABEL_OUTPUT_Y)"
      v-bind="fitText(box.label, 35, box.w - CABLE_LABEL_INSET)"
      class="user-label"
      text-anchor="middle"
      pointer-events="none"
      data-testid="cable-mark"
    >
      {{ box.label }}
    </text>
    <g v-for="wire in layer === 'contacts' ? box.wires : []" :key="wire.id">
      <circle
        :cx="wire.pt.x"
        :cy="wire.pt.y"
        r="22"
        :fill="WIRE_COLOUR_HEX[wire.colour]"
        :stroke="wire.colour === 'green-yellow' ? '#f2c200' : '#fff'"
        stroke-width="8"
        pointer-events="none"
      />
      <circle
        :cx="wire.pt.x"
        :cy="wire.pt.y"
        r="42"
        class="terminal-hit"
        data-kind="terminal"
        data-testid="terminal"
        data-ep-kind="cableWire"
        :data-ep-a="wire.id"
      />
    </g>
  </g>
</template>

<style scoped>
.cable-box {
  fill: #eef2f7;
  stroke: #6b7a90;
  stroke-width: 6;
  cursor: pointer;
}
.cable-box.selected {
  stroke: #0a64d6;
  stroke-width: 12;
}
.cable-box.violation {
  stroke: #b00020;
  stroke-dasharray: 20 10;
  stroke-width: 12;
}
.cable-label {
  font-size: 40px;
  fill: #33415c;
  user-select: none;
}
.user-label {
  font-size: 35px;
  fill: #1f2733;
  user-select: none;
}
.terminal-hit {
  fill: transparent;
  cursor: crosshair;
}
.terminal-hit:hover {
  fill: rgb(10 100 214 / 0.3);
}
</style>
