<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { fitText } from './shapes/fitText'
import {
  CABLE_LABEL_INSET,
  WIRE_COLOUR_HEX,
  cableTextOffsets,
  type CableBox,
} from '@/domain/geometry'

const props = defineProps<{
  /** `body`: boxes and labels (above the wires); `contacts`: wire points (above the wires). */
  layer: 'body' | 'contacts'
  /** Cable boxes of any kind and side; each box is drawn by its own side. */
  boxes: readonly CableBox[]
  selectedId: string | null
  violationIds: ReadonlySet<string>
  titles: Readonly<Record<string, string>>
}>()

interface BoxText {
  x: number
  y: number
  /** Rotation of the caption about its anchor (left/right boxes read bottom-to-top). */
  transform: string | undefined
  /** Room along the text direction. */
  length: number
  labelX: number
  labelY: number
  labelTransform: string | undefined
}

/** Text anchors of a box: captions and labels follow the side, not the kind. */
function textOf(box: CableBox): BoxText {
  const { caption, label } = cableTextOffsets(box.side)
  if (box.side === 'top' || box.side === 'bottom') {
    const x = box.x + box.w / 2
    return {
      x,
      y: box.y + caption,
      transform: undefined,
      length: box.w,
      labelX: x,
      labelY: box.y + label,
      labelTransform: undefined,
    }
  }
  const y = box.y + box.h / 2
  const labelX = box.x + label
  return {
    x: box.x + caption,
    y,
    transform: `rotate(-90 ${box.x + caption} ${y})`,
    length: box.h,
    labelX,
    labelY: y,
    labelTransform: `rotate(-90 ${labelX} ${y})`,
  }
}

const items = computed(() => props.boxes.map((box) => ({ box, text: textOf(box) })))
</script>

<template>
  <g v-for="{ box, text } in items" :key="box.id">
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
      :data-kind="box.kind === 'input' ? 'inputCable' : 'outputCable'"
      :data-id="box.id"
      :data-side="box.side"
      :data-testid="box.kind === 'input' ? 'input-cable' : 'output-cable'"
    >
      <title>{{ titles[box.id] }}</title>
    </rect>
    <text
      v-if="layer === 'body'"
      :x="text.x"
      :y="text.y"
      :transform="text.transform"
      class="cable-label"
      text-anchor="middle"
      pointer-events="none"
    >
      {{
        box.kind === 'input'
          ? t('editor.canvas.inputCaption', { n: box.index + 1 })
          : t('editor.canvas.outputCaption', { n: box.index + 1 })
      }}
    </text>
    <text
      v-if="layer === 'body' && box.label"
      :x="text.labelX"
      :y="text.labelY"
      :transform="text.labelTransform"
      v-bind="fitText(box.label, 35, text.length - CABLE_LABEL_INSET)"
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
