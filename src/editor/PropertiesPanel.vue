<script setup lang="ts">
import { computed } from 'vue'
import { usePanelEditorStore } from '@/stores/panelEditor'
import AtsProps from './properties/AtsProps.vue'
import BlockProps from './properties/BlockProps.vue'
import CableProps from './properties/CableProps.vue'
import ElementProps from './properties/ElementProps.vue'
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
  <aside class="properties" aria-label="Властивості вибраного">
    <RailProps v-if="target?.kind === 'rail'" :key="target.id" :id="target.id" />
    <AtsProps
      v-else-if="target?.kind === 'element' && elementKind === 'ats'"
      :key="target.id"
      :id="target.id"
    />
    <ElementProps v-else-if="target?.kind === 'element'" :key="target.id" :id="target.id" />
    <BlockProps v-else-if="target?.kind === 'block'" :key="target.id" :id="target.id" />
    <CableProps
      v-else-if="target?.kind === 'inputCable' || target?.kind === 'outputCable'"
      :key="target.id"
      :kind="target.kind"
      :id="target.id"
    />
    <WireProps v-else-if="target?.kind === 'wire'" :key="target.id" :id="target.id" />
    <p v-else class="hint">Виберіть рейку, апарат, клемний блок, кабель або провід на схемі.</p>
  </aside>
</template>

<style scoped>
.properties {
  min-width: 15rem;
}
.properties :deep(h3) {
  margin-top: 0;
}
.properties :deep(.field) {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 0.6rem;
}
.properties :deep(.check) {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.4rem;
}
.properties :deep(.row) {
  display: flex;
  gap: 0.5rem;
  align-items: end;
  margin-bottom: 0.5rem;
}
.properties :deep(.hint) {
  color: #55606f;
  font-size: 0.85rem;
}
.properties :deep(fieldset) {
  margin: 0.5rem 0;
}
</style>
