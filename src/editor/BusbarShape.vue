<script setup lang="ts">
import { computed } from 'vue'
import { BLOCK_GREY_HEX, WIRE_COLOUR_HEX, type BusbarBox } from '@/domain/geometry'
import { t } from '@/i18n'

/**
 * A busbar: a thin bar lying against the input edge of the covered devices. `body` is drawn with the
 * bodies (above the wires), `contacts` holds the feeds and the edge handle (above everything).
 */
const props = defineProps<{
  layer: 'body' | 'contacts'
  box: BusbarBox
  selected: boolean
  violation: boolean
  /** Show the drag handle at the right end (selected, editable, not translucent). */
  handle: boolean
}>()

const FEED_NAMES = ['L', 'N']
const title = computed(() =>
  t('editor.shape.busbar', {
    type: props.box.type === 'LN' ? 'L+N' : 'L',
    count: props.box.coveredCount,
  }),
)
const fill = computed(() => (props.box.colour ? WIRE_COLOUR_HEX[props.box.colour] : BLOCK_GREY_HEX))
const handleX = computed(() => props.box.x + props.box.w)
const handleY = computed(() => props.box.y + props.box.h / 2)
</script>

<template>
  <g v-if="layer === 'body'">
    <rect
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="10"
      class="bar"
      :class="{ selected, violation }"
      :style="{ fill }"
      data-kind="busbar"
      data-testid="busbar"
      :data-id="box.id"
    >
      <title>{{ title }}</title>
    </rect>
    <rect
      v-if="box.colour === 'green-yellow'"
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      rx="10"
      class="stripes"
      pointer-events="none"
    />
  </g>
  <g v-else>
    <template v-for="(pt, i) in box.feeds" :key="i">
      <circle
        :cx="pt.x"
        :cy="pt.y"
        r="18"
        :fill="WIRE_COLOUR_HEX[i === 0 ? 'brown' : 'blue']"
        style="stroke: var(--schematic-sheet)"
        stroke-width="6"
        pointer-events="none"
      />
      <circle
        :cx="pt.x"
        :cy="pt.y"
        r="26"
        class="terminal-hit"
        data-kind="terminal"
        data-testid="terminal"
        data-ep-kind="busbar"
        :data-ep-a="box.id"
        :data-ep-b="i"
      >
        <title>{{ t('editor.shape.busbarFeed', { feed: FEED_NAMES[i] ?? '' }) }}</title>
      </circle>
    </template>
    <rect
      v-if="handle"
      :x="handleX - 14"
      :y="handleY - 40"
      width="28"
      height="80"
      rx="8"
      class="handle"
      data-kind="busbar-edge"
      data-testid="busbar-edge"
      :data-id="box.id"
    >
      <title>{{ t('editor.shape.busbarHandle') }}</title>
    </rect>
  </g>
</template>

<style scoped>
.bar {
  fill: var(--schematic-part);
  stroke: #5c4306;
  stroke-width: 4;
  cursor: pointer;
}
.stripes {
  fill: none;
  stroke: #f2c200;
  stroke-width: 40;
  stroke-dasharray: 30 30;
}
.bar.selected {
  stroke: var(--schematic-selection);
  stroke-width: 12;
}
.bar.violation {
  stroke: var(--schematic-error);
  stroke-dasharray: 20 10;
  stroke-width: 12;
}
.terminal-hit {
  fill: transparent;
  cursor: crosshair;
}
.terminal-hit:hover {
  fill: color-mix(in srgb, var(--schematic-selection) 30%, transparent);
}
.handle {
  fill: var(--schematic-sheet);
  stroke: var(--schematic-selection);
  stroke-width: 8;
  cursor: ew-resize;
}
</style>
