<script setup lang="ts">
import { computed } from 'vue'
import { updateElement } from '@/domain/commands'
import { ATS_MIN_WIDTH, MAX_LABEL_LENGTH, MAX_MARKING_LENGTH } from '@/domain/limits'
import { ATS_STATE_NAMES, type AtsState } from '@/domain/panelContent'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => {
  const f = store.index?.elements.get(props.id)
  return f && f.element.kind === 'ats' ? { ...f, element: f.element } : undefined
})
const states: readonly AtsState[] = ['A', 'B', 'off']
</script>

<template>
  <section v-if="found" aria-label="Властивості АВР">
    <h3>АВР</h3>
    <CommitField
      label="Назва"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.element.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { label: v }), 'Змінити назву АВР')"
    />
    <CommitField
      label="Маркування"
      :maxlength="MAX_MARKING_LENGTH"
      :model-value="found.element.marking"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { marking: v }), 'Змінити маркування')"
    />
    <CommitField
      label="Ширина, модулів"
      type="number"
      :min="ATS_MIN_WIDTH"
      :model-value="found.element.widthModules"
      :disabled="store.readOnly"
      @commit="
        (v) => commit(num(v), (n) => updateElement(id, { widthModules: n }), 'Змінити ширину АВР')
      "
    />
    <label class="field">
      Стан
      <select
        :value="found.element.state"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { state: (e.target as HTMLSelectElement).value as AtsState }),
              'Змінити стан АВР',
            )
        "
      >
        <option v-for="s in states" :key="s" :value="s">{{ ATS_STATE_NAMES[s] }}</option>
      </select>
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="found.element.sidesSwapped"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { sidesSwapped: (e.target as HTMLInputElement).checked }),
              'Поміняти входи і виходи',
            )
        "
      />
      Входи знизу, виходи зверху
    </label>
    <p class="hint">Входи: джерело А (L, N) і джерело Б (L, N); виходи: L, N.</p>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      Видалити АВР
    </button>
  </section>
</template>
