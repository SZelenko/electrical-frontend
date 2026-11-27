<script setup lang="ts">
import { computed } from 'vue'
import { resetRoute, updateWire } from '@/domain/commands'
import { WIRE_COLOURS, WIRE_CROSS_SECTIONS } from '@/domain/limits'
import {
  colourName,
  describeEndpoint,
  type WireColour,
  type WireCrossSection,
} from '@/domain/panelContent'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store } = useCommit()
const found = computed(() => store.index?.wires.get(props.id))
const from = computed(() =>
  found.value && store.content ? describeEndpoint(store.content, found.value.wire.start) : '',
)
const to = computed(() =>
  found.value && store.content ? describeEndpoint(store.content, found.value.wire.end) : '',
)
</script>

<template>
  <section v-if="found" aria-label="Властивості проводу">
    <h3>Провід №{{ found.index + 1 }}</h3>
    <p class="hint">{{ from }} → {{ to }}</p>
    <label class="field">
      Колір
      <select
        :value="found.wire.colour"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateWire(id, { colour: (e.target as HTMLSelectElement).value as WireColour }),
              'Змінити колір проводу',
            )
        "
      >
        <option v-for="c in WIRE_COLOURS" :key="c" :value="c">{{ colourName(c) }}</option>
      </select>
    </label>
    <label class="field">
      Переріз, мм²
      <select
        :value="found.wire.crossSection"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateWire(id, {
                crossSection: (e.target as HTMLSelectElement).value as WireCrossSection,
              }),
              'Змінити переріз проводу',
            )
        "
      >
        <option v-for="s in WIRE_CROSS_SECTIONS" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <p class="hint">
      Зламів: {{ found.wire.bends.length }}. Перетягуйте білі маркери; подвійний клік по лінії додає
      злам, по маркеру — видаляє.
    </p>
    <div class="actions">
      <button
        type="button"
        :disabled="store.readOnly"
        @click="ctx.run(resetRoute(id), 'Прокласти маршрут заново')"
      >
        Прокласти маршрут заново
      </button>
      <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
        Видалити провід
      </button>
    </div>
  </section>
</template>
