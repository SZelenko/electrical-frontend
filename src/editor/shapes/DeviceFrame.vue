<script setup lang="ts">
import { computed } from 'vue'
import { terminalX, type ElementBox } from '@/domain/geometry'
import { describeElement, type DeviceElement } from '@/domain/panelContent'
import { t } from '@/i18n'
import { fitText } from './fitText'
import ScrewHead from './ScrewHead.vue'

/**
 * Common look of a modular device: white body, terminal strips at the top and bottom, a front panel
 * with the marking and the label, and a small mark next to the terminals of a transit pole. The
 * style components put their controls into the default slot. No internal conductor lines.
 */
const props = defineProps<{
  element: DeviceElement
  box: ElementBox
  selected: boolean
  violation: boolean
}>()

const STRIP = 110
const PANEL_TOP = 150
const cx = computed(() => props.box.x + props.box.w / 2)
const panel = computed(() => ({
  x: props.box.x + 14,
  y: props.box.y + PANEL_TOP,
  w: props.box.w - 28,
  h: props.box.h - 2 * PANEL_TOP,
}))
const poleXs = computed(() =>
  props.element.poles.map((_, i) =>
    terminalX(props.box.x, props.element.widthModules, i, props.element.poles.length),
  ),
)
const transit = computed(() =>
  props.element.poles.flatMap((pole, i) =>
    pole.transit
      ? [terminalX(props.box.x, props.element.widthModules, i, props.element.poles.length)]
      : [],
  ),
)
const title = computed(() => describeElement(props.element, t))
/** Screw and transit-mark size follow the pole pitch so neighbours never overlap. */
const pitch = computed(() => props.box.w / props.element.poles.length)
const screwR = computed(() => Math.min(30, pitch.value * 0.4))
const markS = computed(() => Math.min(12, pitch.value * 0.25))
const markTop = computed(() => props.box.y + 58 + screwR.value + 6)
const markBottom = computed(() => props.box.y + props.box.h - 58 - screwR.value - 6)
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
      :class="{ selected, violation, off: !element.on }"
      data-kind="element"
      data-testid="element"
      :data-element-style="element.style"
      :data-id="element.id"
    >
      <title>{{ title }}</title>
    </rect>
    <rect
      :x="box.x + 6"
      :y="box.y"
      :width="box.w - 12"
      :height="STRIP"
      class="strip"
      pointer-events="none"
    />
    <rect
      :x="box.x + 6"
      :y="box.y + box.h - STRIP"
      :width="box.w - 12"
      :height="STRIP"
      class="strip"
      pointer-events="none"
    />
    <template v-for="x in poleXs" :key="x">
      <ScrewHead :x="x" :y="box.y + 58" :r="screwR" />
      <ScrewHead :x="x" :y="box.y + box.h - 58" :r="screwR" />
    </template>
    <rect
      :x="panel.x"
      :y="panel.y"
      :width="panel.w"
      :height="panel.h"
      rx="8"
      class="front"
      pointer-events="none"
    />
    <template v-for="x in transit" :key="x">
      <polygon
        :points="`${x - markS},${markTop} ${x + markS},${markTop} ${x},${markTop + markS * 1.2}`"
        class="transit-mark"
        pointer-events="none"
      />
      <polygon
        :points="`${x - markS},${markBottom} ${x + markS},${markBottom} ${x},${markBottom - markS * 1.2}`"
        class="transit-mark"
        pointer-events="none"
      />
    </template>
    <text
      v-if="element.marking"
      :x="cx"
      :y="panel.y + 48"
      class="marking"
      text-anchor="middle"
      v-bind="fitText(element.marking, 36, panel.w - 8)"
      pointer-events="none"
    >
      {{ element.marking }}
    </text>
    <slot />
    <text
      v-if="element.label"
      :x="cx"
      :y="panel.y + panel.h - 24"
      class="label"
      text-anchor="middle"
      v-bind="fitText(element.label, 28, panel.w - 8)"
      pointer-events="none"
    >
      {{ element.label }}
    </text>
  </g>
</template>

<style scoped>
.body {
  fill: #fafbfc;
  stroke: #3b4658;
  stroke-width: 6;
  cursor: grab;
}
.body.off {
  fill: #f1f2f4;
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
.strip {
  fill: #e1e5ea;
}
.front {
  fill: #fff;
  stroke: #c9ced6;
  stroke-width: 4;
}
.transit-mark {
  fill: #e0a100;
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
