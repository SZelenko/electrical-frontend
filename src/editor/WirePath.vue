<script setup lang="ts">
import { computed } from 'vue'
import {
  GREEN_YELLOW_OVERLAY,
  SHORT_CIRCUIT_HIGHLIGHT,
  WIRE_COLOUR_HEX,
  WIRE_STROKE_MM,
} from '@/domain/geometry'
import type { PanelWire } from '@/domain/panelContent'

/** One wire; `wire` is a frozen snapshot, `d` the polyline path in tenths of a millimetre. */
const props = defineProps<{
  wire: Readonly<PanelWire>
  d: string
  selected: boolean
  shortCircuit: boolean
  focused: boolean
  violation: boolean
  /** Draw the clickable hit stroke (off in translucent mode, where the canvas draws it above the bodies). */
  hit?: boolean
}>()

// Stroke widths are drawn in tenths of a millimetre (the model group is scaled by 0.1).
const width = computed(() => WIRE_STROKE_MM[props.wire.crossSection] * 10)
const halo = computed(
  () => (WIRE_STROKE_MM[props.wire.crossSection] + SHORT_CIRCUIT_HIGHLIGHT.extraWidthMm) * 10,
)
</script>

<template>
  <g>
    <path
      v-if="shortCircuit"
      :d="d"
      fill="none"
      :stroke="SHORT_CIRCUIT_HIGHLIGHT.colour"
      :stroke-opacity="focused ? 0.9 : SHORT_CIRCUIT_HIGHLIGHT.opacity"
      :stroke-width="focused ? halo + 20 : halo"
      stroke-linejoin="round"
      pointer-events="none"
    />
    <path
      v-if="selected || violation"
      :d="d"
      fill="none"
      :stroke="violation ? '#b00020' : '#0a64d6'"
      stroke-opacity="0.45"
      :stroke-width="width + 24"
      stroke-linejoin="round"
      pointer-events="none"
    />
    <path
      :d="d"
      fill="none"
      :stroke="WIRE_COLOUR_HEX[wire.colour]"
      :stroke-width="width"
      stroke-linejoin="round"
      pointer-events="none"
    />
    <path
      v-if="wire.colour === 'green-yellow'"
      :d="d"
      fill="none"
      :stroke="GREEN_YELLOW_OVERLAY.stroke"
      :stroke-width="width"
      :stroke-dasharray="
        GREEN_YELLOW_OVERLAY.dasharray
          .split(' ')
          .map((n) => Number(n) * 10)
          .join(' ')
      "
      stroke-linejoin="round"
      pointer-events="none"
    />
    <path
      v-if="hit !== false"
      :d="d"
      fill="none"
      stroke="transparent"
      :stroke-width="Math.max(width, 50)"
      stroke-linejoin="round"
      class="hit"
      data-kind="wire"
      data-testid="wire"
      :data-id="wire.id"
    />
  </g>
</template>

<style scoped>
.hit {
  cursor: pointer;
  pointer-events: stroke;
}
</style>
