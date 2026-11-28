<script setup lang="ts">
import { computed } from 'vue'
import { WIRE_COLOURS, WIRE_CROSS_SECTIONS } from '@/domain/limits'
import { colourName } from '@/domain/panelContent'
import { useEditorContext } from './useEditor'

const ctx = useEditorContext()
const store = ctx.store

// While a wire is drawn undo steps the drawing back instead of the history.
const undoTitle = computed(() => {
  const d = ctx.drawing.value
  if (d) return d.bends.length > 0 ? 'Прибрати останній злам' : 'Скасувати провід'
  return store.undoLabel ? `Скасувати: ${store.undoLabel}` : 'Немає що скасовувати'
})
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Інструменти редактора">
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rail"
      :title="ctx.disabledReason.value.rail ?? 'Додати DIN-рейку'"
      @click="ctx.addRail"
    >
      Додати рейку
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.breaker"
      :title="ctx.disabledReason.value.breaker ?? 'Додати автомат на вибрану рейку'"
      @click="ctx.addDevice('breaker')"
    >
      Додати автомат
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rcd"
      :title="ctx.disabledReason.value.rcd ?? 'Додати ПЗВ на вибрану рейку'"
      @click="ctx.addDevice('rcd')"
    >
      Додати ПЗВ
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.voltageRelay"
      :title="ctx.disabledReason.value.voltageRelay ?? 'Додати реле напруги на вибрану рейку'"
      @click="ctx.addDevice('voltageRelay')"
    >
      Додати реле напруги
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.ats"
      :title="ctx.disabledReason.value.ats ?? 'Додати АВР на вибрану рейку'"
      @click="ctx.addAts"
    >
      Додати АВР
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.block"
      :title="ctx.disabledReason.value.block ?? 'Додати клемний блок на вибрану рейку'"
      @click="ctx.addBlock"
    >
      Додати клемний блок
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.busbar"
      :title="ctx.disabledReason.value.busbar ?? 'Додати шину L від вибраного апарата'"
      @click="ctx.addBusbar('L')"
    >
      Додати шину L
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.busbar"
      :title="ctx.disabledReason.value.busbar ?? 'Додати шину L+N від вибраного апарата'"
      @click="ctx.addBusbar('LN')"
    >
      Додати шину L+N
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rowBlock.top"
      :title="ctx.disabledReason.value.rowBlock.top ?? 'Додати клемник у верхній ряд клемників'"
      data-testid="add-row-block-top"
      @click="ctx.addRowBlock('top')"
    >
      Клемник у верхній ряд
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.rowBlock.bottom"
      :title="ctx.disabledReason.value.rowBlock.bottom ?? 'Додати клемник у нижній ряд клемників'"
      data-testid="add-row-block-bottom"
      @click="ctx.addRowBlock('bottom')"
    >
      Клемник у нижній ряд
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.inputCable"
      :title="ctx.disabledReason.value.inputCable ?? 'Додати вхідний кабель'"
      @click="ctx.addInputCable"
    >
      Додати вхідний кабель
    </button>
    <button
      type="button"
      :disabled="!!ctx.disabledReason.value.outputCable"
      :title="ctx.disabledReason.value.outputCable ?? 'Додати вихідний кабель'"
      @click="ctx.addOutputCable"
    >
      Додати вихідний кабель
    </button>
    <span class="sep" aria-hidden="true" />
    <button
      type="button"
      :disabled="!ctx.drawing.value && !store.canUndo"
      :title="undoTitle"
      :aria-label="store.undoLabel ? `Скасувати: ${store.undoLabel}` : 'Скасувати'"
      @click="ctx.undo"
    >
      ↶ Скасувати
    </button>
    <button
      type="button"
      :disabled="!!ctx.drawing.value || !store.canRedo"
      :title="store.redoLabel ? `Повторити: ${store.redoLabel}` : 'Немає що повторювати'"
      :aria-label="store.redoLabel ? `Повторити: ${store.redoLabel}` : 'Повторити'"
      @click="ctx.redo"
    >
      ↷ Повторити
    </button>
    <button
      type="button"
      :disabled="!store.selection || store.readOnly"
      title="Видалити вибране (Delete)"
      @click="ctx.deleteSelected"
    >
      Видалити вибране
    </button>
    <span class="sep" aria-hidden="true" />
    <button
      type="button"
      :aria-pressed="ctx.translucent.value"
      title="Прозорий режим: корпуси напівпрозорі, проводи під ними доступні; переміщення вимкнено"
      @click="ctx.translucent.value = !ctx.translucent.value"
    >
      Прозорий режим
    </button>
    <label>
      Колір проводу
      <select
        v-model="ctx.wireColour.value"
        :disabled="store.readOnly"
        @change="ctx.recolourDrawing"
      >
        <option v-for="c in WIRE_COLOURS" :key="c" :value="c">{{ colourName(c) }}</option>
      </select>
    </label>
    <label>
      Переріз проводу, мм²
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
