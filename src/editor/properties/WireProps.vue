<script setup lang="ts">
import { computed } from 'vue'
import { resetRoute, updateWire } from '@/domain/commands'
import { WIRE_COLOURS, WIRE_CROSS_SECTIONS } from '@/domain/limits'
import { t } from '@/i18n'
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
  found.value && store.content ? describeEndpoint(store.content, found.value.wire.start, t) : '',
)
const to = computed(() =>
  found.value && store.content ? describeEndpoint(store.content, found.value.wire.end, t) : '',
)
</script>

<template>
  <section v-if="found" :aria-label="t('props.wire.ariaLabel')">
    <h3>{{ t('props.wire.title', { n: found.index + 1 }) }}</h3>
    <p class="hint">{{ from }} → {{ to }}</p>
    <label class="field">
      {{ t('props.colour') }}
      <select
        :value="found.wire.colour"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateWire(id, { colour: (e.target as HTMLSelectElement).value as WireColour }),
              'editor.history.changeWireColour',
            )
        "
      >
        <option v-for="c in WIRE_COLOURS" :key="c" :value="c">{{ colourName(c, t) }}</option>
      </select>
    </label>
    <label class="field">
      {{ t('props.wire.crossSection') }}
      <select
        :value="found.wire.crossSection"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateWire(id, {
                crossSection: (e.target as HTMLSelectElement).value as WireCrossSection,
              }),
              'editor.history.changeWireCrossSection',
            )
        "
      >
        <option v-for="s in WIRE_CROSS_SECTIONS" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <p class="hint">{{ t('props.wire.hint', { count: found.wire.bends.length }) }}</p>
    <div class="actions">
      <button
        type="button"
        :disabled="store.readOnly"
        @click="ctx.run(resetRoute(id), 'editor.history.resetRoute')"
      >
        {{ t('props.wire.reroute') }}
      </button>
      <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
        {{ t('props.wire.delete') }}
      </button>
    </div>
  </section>
</template>
