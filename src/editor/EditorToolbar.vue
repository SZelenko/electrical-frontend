<script setup lang="ts">
import { computed } from 'vue'
import { WIRE_COLOURS, WIRE_CROSS_SECTIONS } from '@/domain/limits'
import { colourName } from '@/domain/panelContent'
import { t } from '@/i18n'
import { useEditorContext } from './useEditor'

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
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rail"
      :title="ctx.disabledReason.value.rail ?? t('editor.toolbar.addRailTitle')"
      @click="ctx.addRail"
    >
      {{ t('editor.toolbar.addRail') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.breaker"
      :title="ctx.disabledReason.value.breaker ?? t('editor.toolbar.addBreakerTitle')"
      @click="ctx.addDevice('breaker')"
    >
      {{ t('editor.toolbar.addBreaker') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rcd"
      :title="ctx.disabledReason.value.rcd ?? t('editor.toolbar.addRcdTitle')"
      @click="ctx.addDevice('rcd')"
    >
      {{ t('editor.toolbar.addRcd') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.voltageRelay"
      :title="ctx.disabledReason.value.voltageRelay ?? t('editor.toolbar.addVoltageRelayTitle')"
      @click="ctx.addDevice('voltageRelay')"
    >
      {{ t('editor.toolbar.addVoltageRelay') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.ats"
      :title="ctx.disabledReason.value.ats ?? t('editor.toolbar.addAtsTitle')"
      @click="ctx.addAts"
    >
      {{ t('editor.toolbar.addAts') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.block"
      :title="ctx.disabledReason.value.block ?? t('editor.toolbar.addBlockTitle')"
      @click="ctx.addBlock"
    >
      {{ t('editor.toolbar.addBlock') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.busbar"
      :title="ctx.disabledReason.value.busbar ?? t('editor.toolbar.addBusbarLTitle')"
      @click="ctx.addBusbar('L')"
    >
      {{ t('editor.toolbar.addBusbarL') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.busbar"
      :title="ctx.disabledReason.value.busbar ?? t('editor.toolbar.addBusbarLNTitle')"
      @click="ctx.addBusbar('LN')"
    >
      {{ t('editor.toolbar.addBusbarLN') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rowBlock.top"
      :title="ctx.disabledReason.value.rowBlock.top ?? t('editor.toolbar.addRowBlockTopTitle')"
      data-testid="add-row-block-top"
      @click="ctx.addRowBlock('top')"
    >
      {{ t('editor.toolbar.addRowBlockTop') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rowBlock.bottom"
      :title="
        ctx.disabledReason.value.rowBlock.bottom ?? t('editor.toolbar.addRowBlockBottomTitle')
      "
      data-testid="add-row-block-bottom"
      @click="ctx.addRowBlock('bottom')"
    >
      {{ t('editor.toolbar.addRowBlockBottom') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.inputCable"
      :title="ctx.disabledReason.value.inputCable ?? t('editor.history.addInputCable')"
      @click="ctx.addInputCable"
    >
      {{ t('editor.toolbar.addInputCable') }}
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.outputCable"
      :title="ctx.disabledReason.value.outputCable ?? t('editor.history.addOutputCable')"
      @click="ctx.addOutputCable"
    >
      {{ t('editor.toolbar.addOutputCable') }}
    </button>
    <span class="sep" aria-hidden="true" />
    <button
      type="button"
      :disabled="!ctx.drawing.value && !store.canUndo"
      :title="undoTitle"
      :aria-label="
        store.undoLabel
          ? t('editor.toolbar.undoWith', { label: t(store.undoLabel) })
          : t('editor.toolbar.undo')
      "
      @click="ctx.undo"
    >
      ↶ {{ t('editor.toolbar.undo') }}
    </button>
    <button
      type="button"
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
      ↷ {{ t('editor.toolbar.redo') }}
    </button>
    <button
      type="button"
      :disabled="!store.selection || store.readOnly"
      :title="t('editor.toolbar.deleteSelectedTitle')"
      @click="ctx.deleteSelected"
    >
      {{ t('editor.toolbar.deleteSelected') }}
    </button>
    <span class="sep" aria-hidden="true" />
    <button
      type="button"
      :aria-pressed="ctx.translucent.value"
      :title="t('editor.toolbar.translucentTitle')"
      @click="ctx.translucent.value = !ctx.translucent.value"
    >
      {{ t('editor.toolbar.translucent') }}
    </button>
    <label>
      {{ t('editor.toolbar.wireColour') }}
      <select
        v-model="ctx.wireColour.value"
        :disabled="store.readOnly"
        @change="ctx.recolourDrawing"
      >
        <option v-for="c in WIRE_COLOURS" :key="c" :value="c">{{ colourName(c, t) }}</option>
      </select>
    </label>
    <label>
      {{ t('editor.toolbar.wireCrossSection') }}
      <select v-model="ctx.wireCrossSection.value" :disabled="store.readOnly">
        <option v-for="s in WIRE_CROSS_SECTIONS" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <span v-if="ctx.disabledReason.value.wire" class="limit">{{
      ctx.disabledReason.value.wire
    }}</span>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin: 0.75rem 0;
}
.toolbar label {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  font-size: 0.9rem;
}
.sep {
  width: 1px;
  height: 1.5rem;
  background: #c3cad4;
}
.limit {
  color: #b00020;
}
</style>
