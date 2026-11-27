<script setup lang="ts">
import { computed } from 'vue'
import {
  railContactY,
  terminalX,
  VBLOCK_INSET,
  MODULE,
  type BlockBox,
  type ElementBox,
} from '@/domain/geometry'
import type { PanelElement, TerminalBlock } from '@/domain/panelContent'
import ToggleZone from './shapes/ToggleZone.vue'
import { toggleZone } from './shapes/toggleZones'

/**
 * Contact dots and their hit areas of one element, ATS or terminal block. Drawn in a layer above the
 * wires so the contacts stay clickable where a wire passes over them.
 */
const props = defineProps<{
  box: ElementBox | BlockBox
  element?: PanelElement
  block?: TerminalBlock
  readOnly?: boolean
}>()

const zone = computed(() =>
  props.element ? toggleZone(props.element, props.box as ElementBox) : null,
)

interface Spot {
  key: string
  x: number
  y: number
  r: number
  title: string
  attrs: Record<string, string | number>
}

const ATS_INPUT_NAMES = ['А L', 'А N', 'Б L', 'Б N']
const ATS_OUTPUT_NAMES = ['L', 'N']

const spots = computed<Spot[]>(() => {
  const { box, element, block } = props
  const out: Spot[] = []
  if (element) {
    const b = box as ElementBox
    const w = element.widthModules
    const isAts = element.kind === 'ats'
    const inputs = b.poleCount
    const outputs = b.outputCount
    for (const side of ['input', 'output'] as const) {
      const count = side === 'input' ? inputs : outputs
      const y = (side === 'input') !== b.sidesSwapped ? b.y : b.y + b.h
      for (let i = 0; i < count; i++) {
        out.push({
          key: `${side}${i}`,
          x: terminalX(b.x, w, i, count),
          y,
          // never wider than half the pitch, so neighbouring poles stay pickable
          r: Math.min(isAts ? 34 : 38, Math.floor(b.w / count / 2)),
          title: isAts
            ? `${side === 'input' ? 'Вхід' : 'Вихід'} ${(side === 'input' ? ATS_INPUT_NAMES : ATS_OUTPUT_NAMES)[i]}`
            : `Полюс ${i + 1} (${side === 'input' ? 'вхід' : 'вихід'})`,
          attrs: {
            'data-ep-kind': 'pole',
            'data-ep-a': element.id,
            'data-ep-b': i,
            'data-ep-side': side,
          },
        })
      }
    }
  } else if (block) {
    const b = box as BlockBox
    const row = b.railId === null
    for (let i = 0; i < block.terminalCount; i++) {
      for (const side of row ? (['top', 'bottom'] as const) : (['left', 'right'] as const)) {
        out.push({
          key: `${side}${i}`,
          x: row
            ? terminalX(b.x, block.widthModules, i, block.terminalCount)
            : side === 'left'
              ? b.x + VBLOCK_INSET
              : b.x + MODULE - VBLOCK_INSET,
          y: row ? (side === 'top' ? b.y : b.y + b.h) : railContactY(b, i),
          r: row ? 38 : 30,
          title: `Клема ${i + 1}`,
          attrs: {
            'data-ep-kind': 'terminal',
            'data-ep-a': block.id,
            'data-ep-b': i,
            'data-ep-cs': side,
          },
        })
      }
    }
  }
  return out
})
</script>

<template>
  <g>
    <ToggleZone
      v-if="zone && element"
      :id="element.id"
      :x="zone.x"
      :y="zone.y"
      :width="zone.width"
      :height="zone.height"
      :label="zone.label"
      :read-only="readOnly ?? false"
    />
    <template v-for="spot in spots" :key="spot.key">
      <circle :cx="spot.x" :cy="spot.y" r="18" class="terminal" pointer-events="none" />
      <circle
        :cx="spot.x"
        :cy="spot.y"
        :r="spot.r"
        class="terminal-hit"
        data-kind="terminal"
        data-testid="terminal"
        v-bind="spot.attrs"
      >
        <title>{{ spot.title }}</title>
      </circle>
    </template>
  </g>
</template>

<style scoped>
.terminal {
  fill: #fff;
  stroke: #3b4658;
  stroke-width: 6;
}
.terminal-hit {
  fill: transparent;
  cursor: crosshair;
}
.terminal-hit:hover {
  fill: rgb(10 100 214 / 0.3);
}
</style>
