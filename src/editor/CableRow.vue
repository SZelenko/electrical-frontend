<script setup lang="ts">
import { computed } from 'vue'
import { mdiFlash, mdiLightbulbOutline, mdiPowerSocketEu } from '@mdi/js'
import { t } from '@/i18n'
import {
  CABLE_DOT_R,
  CABLE_DOT_STROKE,
  CABLE_HIT_R,
  cableBoxContent,
  fitCableText,
  type CableBoxContent,
  type FittedText,
} from '@/domain/cableBoxContent'
import { CABLE_ICON, GREEN_YELLOW_OVERLAY, WIRE_COLOUR_HEX, type CableBox } from '@/domain/geometry'

const props = defineProps<{
  /** `body`: boxes and labels (above the wires); `contacts`: wire points (above the wires). */
  layer: 'body' | 'contacts'
  /** Cable boxes of any kind and side; each box is drawn by its own side. */
  boxes: readonly CableBox[]
  selectedId: string | null
  violationIds: ReadonlySet<string>
  titles: Readonly<Record<string, string>>
}>()

/** The 24-unit icon paths are scaled to the `CABLE_ICON` square. */
const ICON_SCALE = CABLE_ICON / 24

function iconPath(box: CableBox): string {
  if (box.kind === 'input') return mdiFlash
  return box.load === 'lighting' ? mdiLightbulbOutline : mdiPowerSocketEu
}

interface Item {
  box: CableBox
  content: CableBoxContent
  caption: string
  fittedCaption: FittedText
  fittedLabel: FittedText | null
}

const items = computed<Item[]>(() =>
  props.boxes.map((box) => {
    const content = cableBoxContent(box)
    const caption =
      box.kind === 'input'
        ? t('editor.canvas.inputCaption', { n: box.index + 1 })
        : t('editor.canvas.outputCaption', { n: box.index + 1 })
    return {
      box,
      content,
      caption,
      fittedCaption: fitCableText(caption, content.room),
      fittedLabel: box.label ? fitCableText(box.label, content.room) : null,
    }
  }),
)

function rotation(c: CableBoxContent, at: { x: number; y: number }): string | undefined {
  return c.rotated ? `rotate(-90 ${at.x} ${at.y})` : undefined
}
function iconTransform(c: CableBoxContent): string {
  const { x, y } = c.icon
  const turn = c.rotated ? ' rotate(-90)' : ''
  return `translate(${x} ${y})${turn} scale(${ICON_SCALE}) translate(-12 -12)`
}
</script>

<template>
  <g v-for="{ box, content, fittedCaption, fittedLabel } in items" :key="box.id">
    <rect
      v-if="layer === 'body'"
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="12"
      class="cable-box"
      :class="{
        [box.kind]: true,
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
    <path
      v-if="layer === 'body'"
      :d="iconPath(box)"
      :transform="iconTransform(content)"
      class="cable-icon"
      :class="box.kind"
      pointer-events="none"
      data-testid="cable-icon"
      :data-icon="box.kind === 'input' ? 'flash' : box.load"
    />
    <text
      v-if="layer === 'body'"
      :x="content.caption.x"
      :y="content.caption.y"
      :transform="rotation(content, content.caption)"
      :font-size="fittedCaption.size"
      class="cable-label"
      text-anchor="middle"
      pointer-events="none"
    >
      {{ fittedCaption.text }}
    </text>
    <text
      v-if="layer === 'body' && fittedLabel"
      :x="content.label.x"
      :y="content.label.y"
      :transform="rotation(content, content.label)"
      :font-size="fittedLabel.size"
      class="user-label"
      text-anchor="middle"
      pointer-events="none"
      data-testid="cable-mark"
    >
      {{ fittedLabel.text }}
    </text>
    <g v-for="wire in layer === 'contacts' ? box.wires : []" :key="wire.id">
      <circle
        :cx="wire.pt.x"
        :cy="wire.pt.y"
        :r="CABLE_DOT_R - CABLE_DOT_STROKE / 2"
        :fill="WIRE_COLOUR_HEX[wire.colour]"
        :style="{
          stroke:
            wire.colour === 'green-yellow' ? GREEN_YELLOW_OVERLAY.stroke : 'var(--schematic-sheet)',
        }"
        :stroke-width="CABLE_DOT_STROKE"
        pointer-events="none"
      />
      <circle
        :cx="wire.pt.x"
        :cy="wire.pt.y"
        :r="CABLE_HIT_R"
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
  stroke-width: 6;
  cursor: pointer;
}
.cable-box.input {
  fill: var(--schematic-input-fill);
  stroke: var(--schematic-input);
}
.cable-box.output {
  fill: var(--schematic-output-fill);
  stroke: var(--schematic-output);
}
.cable-icon.input {
  fill: var(--schematic-input);
}
.cable-icon.output {
  fill: var(--schematic-output);
}
.cable-box.selected {
  stroke: var(--schematic-selection);
  stroke-width: 12;
}
.cable-box.violation {
  stroke: var(--schematic-error);
  stroke-dasharray: 20 10;
  stroke-width: 12;
}
.cable-label {
  fill: var(--schematic-caption);
  user-select: none;
}
.user-label {
  fill: var(--schematic-caption);
  user-select: none;
}
.terminal-hit {
  fill: transparent;
  cursor: crosshair;
}
.terminal-hit:hover {
  fill: color-mix(in srgb, var(--schematic-selection) 30%, transparent);
}
</style>
