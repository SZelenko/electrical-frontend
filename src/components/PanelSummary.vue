<script setup lang="ts">
import { computed } from 'vue'
import {
  colourName,
  describeElement,
  describePanelWire,
  describeShortCircuit,
  formatInputCableLabel,
  rowBlocks,
  type PanelContent,
  type RowId,
  type ShortCircuit,
  type WireColour,
} from '@/domain/panelContent'
import { t } from '@/i18n'

const props = defineProps<{ content: PanelContent; shortCircuits: ShortCircuit[] }>()

const circuits = computed(() =>
  props.shortCircuits.map((group) => describeShortCircuit(props.content, group, t)),
)
const ROWS: readonly RowId[] = ['top', 'bottom']
const colourOrGrey = (colour: WireColour | null) =>
  colour ? colourName(colour, t) : t('domain.colour.grey')
const cableTitle = (n: number, label: string) =>
  label ? t('panels.summary.cableLabelled', { n, label }) : t('panels.summary.cable', { n })
</script>

<template>
  <v-card variant="outlined" class="pa-3 my-3">
    <section aria-labelledby="sum-input">
      <h2 id="sum-input">{{ t('panels.summary.inputCables') }}</h2>
      <p>
        {{
          t('panels.summary.placement', {
            side: t(`domain.cableSide.${content.inputCableSide}`),
          })
        }}
      </p>
      <ul>
        <li v-for="(cable, i) in content.inputCables" :key="cable.id">
          {{ cableTitle(i + 1, cable.label) }}:
          {{ formatInputCableLabel(cable, t) }}
          <ul>
            <li v-for="(wire, j) in cable.wires" :key="wire.id">
              {{ t('panels.summary.wire', { n: j + 1, colour: colourName(wire.colour, t) }) }}
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section aria-labelledby="sum-output">
      <h2 id="sum-output">{{ t('panels.summary.outputCables') }}</h2>
      <p>
        {{
          t('panels.summary.placement', {
            side: t(`domain.cableSide.${content.outputCableSide}`),
          })
        }}
      </p>
      <p v-if="content.outputCables.length === 0">{{ t('common.none') }}</p>
      <ul v-else>
        <li v-for="(cable, i) in content.outputCables" :key="cable.id">
          {{ cableTitle(i + 1, cable.label) }}: {{ cable.description }}
          <ul>
            <li v-for="(wire, j) in cable.wires" :key="wire.id">
              {{ t('panels.summary.wire', { n: j + 1, colour: colourName(wire.colour, t) }) }}
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-for="row in ROWS" :key="row" :aria-labelledby="`sum-row-${row}`">
      <h2 :id="`sum-row-${row}`">{{ t(`domain.rowTitle.${row}`) }}</h2>
      <p v-if="rowBlocks(content, row).length === 0">{{ t('common.none') }}</p>
      <ul v-else>
        <li v-for="block in rowBlocks(content, row)" :key="block.id">
          {{
            t('panels.summary.rowBlock', {
              name: block.label || t('panels.summary.defaultBlock'),
              width: block.widthModules,
              count: block.terminalCount,
              colour: colourOrGrey(block.colour),
            })
          }}
        </li>
      </ul>
    </section>

    <section aria-labelledby="sum-rails">
      <h2 id="sum-rails">{{ t('panels.summary.rails') }}</h2>
      <p>{{ t('panels.summary.railWidth', { n: content.railWidthModules }) }}</p>
      <p v-if="content.rails.length === 0">{{ t('common.none') }}</p>
      <ul v-else>
        <li v-for="(rail, i) in content.rails" :key="rail.id">
          {{ t('panels.summary.rail', { n: i + 1, spacing: rail.spacingMm }) }}
          <h3>{{ t('panels.summary.devices') }}</h3>
          <p v-if="rail.elements.length === 0">{{ t('common.none') }}</p>
          <ul v-else>
            <li v-for="element in rail.elements" :key="element.id">
              {{ describeElement(element, t) }}
            </li>
          </ul>
          <template v-if="rail.busbars.length > 0">
            <h3>{{ t('panels.summary.busbars') }}</h3>
            <ul>
              <li v-for="busbar in rail.busbars" :key="busbar.id">
                {{
                  t('panels.summary.busbar', {
                    type: busbar.type === 'LN' ? 'L+N' : 'L',
                    n: busbar.count,
                    colour: colourOrGrey(busbar.colour),
                  })
                }}
              </li>
            </ul>
          </template>
          <h3>{{ t('panels.summary.terminalBlocks') }}</h3>
          <p v-if="rail.terminalBlocks.length === 0">{{ t('common.none') }}</p>
          <ul v-else>
            <li v-for="block in rail.terminalBlocks" :key="block.id">
              {{
                block.label
                  ? t('panels.summary.railBlockLabelled', {
                      label: block.label,
                      width: block.widthModules,
                      count: block.terminalCount,
                      colour: colourOrGrey(block.colour),
                    })
                  : t('panels.summary.railBlock', {
                      width: block.widthModules,
                      count: block.terminalCount,
                      colour: colourOrGrey(block.colour),
                    })
              }}
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section aria-labelledby="sum-wires">
      <h2 id="sum-wires">{{ t('panels.summary.wires') }}</h2>
      <p>{{ t('panels.summary.wireCount', { n: content.wires.length }) }}</p>
      <ul>
        <li v-for="(wire, i) in content.wires" :key="wire.id">
          {{ describePanelWire(content, wire, i, t) }}
        </li>
      </ul>
    </section>

    <section aria-labelledby="sum-sc">
      <h2 id="sum-sc">{{ t('panels.summary.shortCircuits') }}</h2>
      <p v-if="circuits.length === 0">{{ t('panels.summary.noShortCircuits') }}</p>
      <template v-else>
        <v-alert type="error" variant="tonal" density="compact" class="mb-2">
          {{ t('panels.summary.foundShortCircuits', { n: circuits.length }) }}
        </v-alert>
        <ul>
          <li v-for="(group, i) in circuits" :key="i">
            {{
              t('panels.summary.group', {
                n: i + 1,
                sources: group.sources.join('; '),
                wires: group.wires.join(', ') || t('panels.summary.noWires'),
              })
            }}
          </li>
        </ul>
      </template>
    </section>
  </v-card>
</template>
