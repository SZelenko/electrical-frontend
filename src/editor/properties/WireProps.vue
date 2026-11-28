<script setup lang="ts">
import { computed } from 'vue'
import { resetRoute, updateWire } from '@/domain/commands'
import { WIRE_COLOURS, WIRE_CROSS_SECTIONS } from '@/domain/limits'
import { t } from '@/i18n'
import { colourName, describeEndpoint } from '@/domain/panelContent'
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store } = useCommit()
const found = computed(() => store.index?.wires.get(props.id))
const colourItems = computed(() => WIRE_COLOURS.map((c) => ({ title: colourName(c, t), value: c })))
const sectionItems = WIRE_CROSS_SECTIONS.map((s) => ({ title: s, value: s }))
const from = computed(() =>
  found.value && store.content ? describeEndpoint(store.content, found.value.wire.start, t) : '',
)
const to = computed(() =>
  found.value && store.content ? describeEndpoint(store.content, found.value.wire.end, t) : '',
)
</script>

<template>
  <section v-if="found" :aria-label="t('props.wire.ariaLabel')">
    <h3 class="text-subtitle-1 mb-2">{{ t('props.wire.title', { n: found.index + 1 }) }}</h3>
    <p class="hint text-caption text-medium-emphasis">{{ from }} → {{ to }}</p>
    <SelectField
      :label="t('props.colour')"
      :model-value="found.wire.colour"
      :items="colourItems"
      :disabled="store.readOnly"
      @update:model-value="
        (colour) => ctx.run(updateWire(id, { colour }), 'editor.history.changeWireColour')
      "
    />
    <SelectField
      :label="t('props.wire.crossSection')"
      :model-value="found.wire.crossSection"
      :items="sectionItems"
      :disabled="store.readOnly"
      @update:model-value="
        (crossSection) =>
          ctx.run(updateWire(id, { crossSection }), 'editor.history.changeWireCrossSection')
      "
    />
    <p class="hint text-caption text-medium-emphasis">
      {{ t('props.wire.hint', { count: found.wire.bends.length }) }}
    </p>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        type="button"
        size="small"
        :disabled="store.readOnly"
        @click="ctx.run(resetRoute(id), 'editor.history.resetRoute')"
      >
        {{ t('props.wire.reroute') }}
      </v-btn>
      <v-btn
        type="button"
        size="small"
        color="error"
        :disabled="store.readOnly"
        @click="ctx.deleteSelected"
      >
        {{ t('props.wire.delete') }}
      </v-btn>
    </div>
  </section>
</template>
