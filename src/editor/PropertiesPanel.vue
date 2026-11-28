<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { usePanelEditorStore } from '@/stores/panelEditor'
import AtsProps from './properties/AtsProps.vue'
import BlockProps from './properties/BlockProps.vue'
import CableProps from './properties/CableProps.vue'
import ElementProps from './properties/ElementProps.vue'
import BusbarProps from './properties/BusbarProps.vue'
import PanelProps from './properties/PanelProps.vue'
import RailProps from './properties/RailProps.vue'
import WireProps from './properties/WireProps.vue'

const store = usePanelEditorStore()

/** A selected cable wire is edited through its cable. */
const target = computed(() => {
  const s = store.selection
  if (!s) return null
  if (s.kind === 'cableWire') {
    const found = store.index?.cableWires.get(s.id)
    return found
      ? {
          kind: found.kind === 'input' ? ('inputCable' as const) : ('outputCable' as const),
          id: found.cableId,
        }
      : null
  }
  return s
})

const elementKind = computed(() =>
  target.value?.kind === 'element'
    ? store.index?.elements.get(target.value.id)?.element.kind
    : undefined,
)
</script>

<template>
  <aside class="properties" :aria-label="t('props.ariaLabel')">
    <RailProps v-if="target?.kind === 'rail'" :key="target.id" :id="target.id" />
    <AtsProps
      v-else-if="target?.kind === 'element' && elementKind === 'ats'"
      :key="target.id"
      :id="target.id"
    />
    <ElementProps v-else-if="target?.kind === 'element'" :key="target.id" :id="target.id" />
    <BusbarProps v-else-if="target?.kind === 'busbar'" :key="target.id" :id="target.id" />
    <BlockProps v-else-if="target?.kind === 'block'" :key="target.id" :id="target.id" />
    <CableProps
      v-else-if="target?.kind === 'inputCable' || target?.kind === 'outputCable'"
      :key="target.id"
      :kind="target.kind"
      :id="target.id"
    />
    <WireProps v-else-if="target?.kind === 'wire'" :key="target.id" :id="target.id" />
    <PanelProps v-else />
  </aside>
</template>

<style scoped>
.properties {
  min-width: 15rem;
  min-height: 0;
  overflow-y: auto;
}
.properties :deep(h3) {
  margin-top: 0;
}
.properties :deep(.field) {
  margin-bottom: 0.6rem;
}
.properties :deep(.hint) {
  margin: 0 0 0.4rem;
}
.properties :deep(fieldset) {
  margin: 0.5rem 0;
  padding: 0.25rem 0.5rem;
  border: 1px solid rgb(var(--v-theme-schematic-border));
  border-radius: 4px;
}
</style>
