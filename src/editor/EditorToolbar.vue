<script setup lang="ts">
import { computed } from 'vue'
import { mdiRedo, mdiUndo } from '@mdi/js'
import { WIRE_COLOURS, WIRE_CROSS_SECTIONS } from '@/domain/limits'
import { colourName } from '@/domain/panelContent'
import { t } from '@/i18n'
import { useEditorContext } from './useEditor'

const colourItems = computed(() => WIRE_COLOURS.map((c) => ({ title: colourName(c, t), value: c })))
const sectionItems = WIRE_CROSS_SECTIONS.map((s) => ({ title: s, value: s }))
const ctx = useEditorContext()
const store = ctx.store

// While a wire is drawn undo steps the drawing back instead of the history.
const undoTitle = computed(() => {
  const d = ctx.drawing.value
  if (d) {
    return d.bends.length > 0
      ? t('editor.toolbar.undoRemoveBend')
      : t('editor.toolbar.undoCancelWire')
  }
  return store.undoLabel
    ? t('editor.toolbar.undoWith', { label: t(store.undoLabel) })
    : t('editor.toolbar.nothingToUndo')
})
</script>

<template>
  <div class="toolbar" role="toolbar" :aria-label="t('editor.toolbar.ariaLabel')">
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.rail"
      :title="ctx.disabledReason.value.rail ?? t('editor.toolbar.addRailTitle')"
      @click="ctx.addRail"
    >
      {{ t('editor.toolbar.addRail') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.breaker"
      :title="ctx.disabledReason.value.breaker ?? t('editor.toolbar.addBreakerTitle')"
      @click="ctx.addDevice('breaker')"
    >
      {{ t('editor.toolbar.addBreaker') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.rcd"
      :title="ctx.disabledReason.value.rcd ?? t('editor.toolbar.addRcdTitle')"
      @click="ctx.addDevice('rcd')"
    >
      {{ t('editor.toolbar.addRcd') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.voltageRelay"
      :title="ctx.disabledReason.value.voltageRelay ?? t('editor.toolbar.addVoltageRelayTitle')"
      @click="ctx.addDevice('voltageRelay')"
    >
      {{ t('editor.toolbar.addVoltageRelay') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.ats"
      :title="ctx.disabledReason.value.ats ?? t('editor.toolbar.addAtsTitle')"
      @click="ctx.addAts"
    >
      {{ t('editor.toolbar.addAts') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.block"
      :title="ctx.disabledReason.value.block ?? t('editor.toolbar.addBlockTitle')"
      @click="ctx.addBlock"
    >
      {{ t('editor.toolbar.addBlock') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.busbar"
      :title="ctx.disabledReason.value.busbar ?? t('editor.toolbar.addBusbarLTitle')"
      @click="ctx.addBusbar('L')"
    >
      {{ t('editor.toolbar.addBusbarL') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.busbar"
      :title="ctx.disabledReason.value.busbar ?? t('editor.toolbar.addBusbarLNTitle')"
      @click="ctx.addBusbar('LN')"
    >
      {{ t('editor.toolbar.addBusbarLN') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.rowBlock.top"
      :title="ctx.disabledReason.value.rowBlock.top ?? t('editor.toolbar.addRowBlockTopTitle')"
      data-testid="add-row-block-top"
      @click="ctx.addRowBlock('top')"
    >
      {{ t('editor.toolbar.addRowBlockTop') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.rowBlock.bottom"
      :title="
        ctx.disabledReason.value.rowBlock.bottom ?? t('editor.toolbar.addRowBlockBottomTitle')
      "
      data-testid="add-row-block-bottom"
      @click="ctx.addRowBlock('bottom')"
    >
      {{ t('editor.toolbar.addRowBlockBottom') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.inputCable"
      :title="ctx.disabledReason.value.inputCable ?? t('editor.history.addInputCable')"
      @click="ctx.addInputCable"
    >
      {{ t('editor.toolbar.addInputCable') }}
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!!ctx.disabledReason.value.outputCable"
      :title="ctx.disabledReason.value.outputCable ?? t('editor.history.addOutputCable')"
      @click="ctx.addOutputCable"
    >
      {{ t('editor.toolbar.addOutputCable') }}
    </v-btn>
    <v-divider vertical class="mx-1" />
    <v-btn
      type="button"
      size="small"
      density="compact"
      :icon="mdiUndo"
      :disabled="!ctx.drawing.value && !store.canUndo"
      :title="undoTitle"
      :aria-label="
        store.undoLabel
          ? t('editor.toolbar.undoWith', { label: t(store.undoLabel) })
          : t('editor.toolbar.undo')
      "
      @click="ctx.undo"
    >
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :icon="mdiRedo"
      :disabled="!!ctx.drawing.value || !store.canRedo"
      :title="
        store.redoLabel
          ? t('editor.toolbar.redoWith', { label: t(store.redoLabel) })
          : t('editor.toolbar.nothingToRedo')
      "
      :aria-label="
        store.redoLabel
          ? t('editor.toolbar.redoWith', { label: t(store.redoLabel) })
          : t('editor.toolbar.redo')
      "
      @click="ctx.redo"
    >
    </v-btn>
    <v-btn
      type="button"
      size="small"
      density="compact"
      :disabled="!store.selection || store.readOnly"
      :title="t('editor.toolbar.deleteSelectedTitle')"
      @click="ctx.deleteSelected"
    >
      {{ t('editor.toolbar.deleteSelected') }}
    </v-btn>
    <v-divider vertical class="mx-1" />
    <v-btn
      type="button"
      size="small"
      density="compact"
      :variant="ctx.translucent.value ? 'flat' : 'tonal'"
      :color="ctx.translucent.value ? 'primary' : undefined"
      :aria-pressed="ctx.translucent.value"
      :title="t('editor.toolbar.translucentTitle')"
      @click="ctx.translucent.value = !ctx.translucent.value"
    >
      {{ t('editor.toolbar.translucent') }}
    </v-btn>
    <v-select
      v-model="ctx.wireColour.value"
      :label="t('editor.toolbar.wireColour')"
      :items="colourItems"
      :disabled="store.readOnly"
      class="toolbar-select"
      @update:model-value="ctx.recolourDrawing"
    />
    <v-select
      v-model="ctx.wireCrossSection.value"
      :label="t('editor.toolbar.wireCrossSection')"
      :items="sectionItems"
      :disabled="store.readOnly"
      class="toolbar-select"
    />
    <span v-if="ctx.disabledReason.value.wire" class="limit text-error">{{
      ctx.disabledReason.value.wire
    }}</span>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
  margin: 0.4rem 0;
}
.toolbar-select {
  flex: 0 0 auto;
  width: 10.5rem;
  --v-input-control-height: 30px;
  --v-field-padding-top: 4px;
  --v-field-padding-bottom: 4px;
}
</style>
