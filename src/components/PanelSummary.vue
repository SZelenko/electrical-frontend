<script setup lang="ts">
import { computed } from 'vue'
import {
  colourName,
  describeElement,
  describePanelWire,
  describeShortCircuit,
  formatInputCableLabel,
  pluralUk,
  type PanelContent,
  type ShortCircuit,
} from '@/domain/panelContent'

const props = defineProps<{ content: PanelContent; shortCircuits: ShortCircuit[] }>()

const circuits = computed(() =>
  props.shortCircuits.map((group) => describeShortCircuit(props.content, group)),
)
const wireWord = (n: number) => pluralUk(n, 'провід', 'проводи', 'проводів')
</script>

<template>
  <section aria-labelledby="sum-input">
    <h2 id="sum-input">Вхідні кабелі</h2>
    <ul>
      <li v-for="(cable, i) in content.inputCables" :key="cable.id">
        Кабель {{ i + 1 }}{{ cable.label ? ` «${cable.label}»` : '' }}:
        {{ formatInputCableLabel(cable) }}
        <ul>
          <li v-for="(wire, j) in cable.wires" :key="wire.id">
            Провід {{ j + 1 }}: {{ colourName(wire.colour) }}
          </li>
        </ul>
      </li>
    </ul>
  </section>

  <section aria-labelledby="sum-output">
    <h2 id="sum-output">Вихідні кабелі</h2>
    <p v-if="content.outputCables.length === 0">Немає.</p>
    <ul v-else>
      <li v-for="(cable, i) in content.outputCables" :key="cable.id">
        Кабель {{ i + 1 }}{{ cable.label ? ` «${cable.label}»` : '' }}: {{ cable.description }}
        <ul>
          <li v-for="(wire, j) in cable.wires" :key="wire.id">
            Провід {{ j + 1 }}: {{ colourName(wire.colour) }}
          </li>
        </ul>
      </li>
    </ul>
  </section>

  <section aria-labelledby="sum-row">
    <h2 id="sum-row">Рядок клемників</h2>
    <p v-if="content.terminalRow.length === 0">Немає.</p>
    <ul v-else>
      <li v-for="block in content.terminalRow" :key="block.id">
        {{ block.label || 'Клемник' }}: {{ block.widthModules }} мод., клем:
        {{ block.terminalCount }}, колір: {{ block.colour ? colourName(block.colour) : 'сірий' }}
      </li>
    </ul>
  </section>

  <section aria-labelledby="sum-rails">
    <h2 id="sum-rails">DIN-рейки</h2>
    <p>Ширина рейок: {{ content.railWidthModules }} мод.</p>
    <p v-if="content.rails.length === 0">Немає.</p>
    <ul v-else>
      <li v-for="(rail, i) in content.rails" :key="rail.id">
        Рейка {{ i + 1 }}: відступ {{ rail.spacingMm }} мм
        <h3>Апарати</h3>
        <p v-if="rail.elements.length === 0">Немає.</p>
        <ul v-else>
          <li v-for="element in rail.elements" :key="element.id">
            {{ describeElement(element) }}
          </li>
        </ul>
        <template v-if="rail.busbars.length > 0">
          <h3>Шини</h3>
          <ul>
            <li v-for="busbar in rail.busbars" :key="busbar.id">
              Шина {{ busbar.type === 'LN' ? 'L+N' : 'L' }}: апаратів {{ busbar.count }}, колір:
              {{ busbar.colour ? colourName(busbar.colour) : 'сірий' }}
            </li>
          </ul>
        </template>
        <h3>Клемні блоки</h3>
        <p v-if="rail.terminalBlocks.length === 0">Немає.</p>
        <ul v-else>
          <li v-for="block in rail.terminalBlocks" :key="block.id">
            {{ block.label ? `${block.label}: ` : '' }}{{ block.widthModules }} мод., клем:
            {{ block.terminalCount }}, колір:
            {{ block.colour ? colourName(block.colour) : 'сірий' }}
          </li>
        </ul>
      </li>
    </ul>
  </section>

  <section aria-labelledby="sum-wires">
    <h2 id="sum-wires">Проводи щита</h2>
    <p>{{ content.wires.length }} {{ wireWord(content.wires.length) }}</p>
    <ul>
      <li v-for="(wire, i) in content.wires" :key="wire.id">
        {{ describePanelWire(content, wire, i) }}
      </li>
    </ul>
  </section>

  <section aria-labelledby="sum-sc">
    <h2 id="sum-sc">Короткі замикання</h2>
    <p v-if="circuits.length === 0">КЗ не виявлено</p>
    <template v-else>
      <p role="alert">Виявлено КЗ: {{ circuits.length }}</p>
      <ul>
        <li v-for="(group, i) in circuits" :key="i">
          Група {{ i + 1 }}: джерела — {{ group.sources.join('; ') }}; проводи —
          {{ group.wires.join(', ') || 'немає' }}
        </li>
      </ul>
    </template>
  </section>
</template>
