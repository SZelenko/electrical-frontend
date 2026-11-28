<script setup lang="ts">
import { computed } from 'vue'
import { updateElement } from '@/domain/commands'
import { ATS_MIN_WIDTH, MAX_LABEL_LENGTH, MAX_MARKING_LENGTH } from '@/domain/limits'
import { atsStateName, type AtsState } from '@/domain/panelContent'
import { t } from '@/i18n'
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
  <section v-if="found" :aria-label="t('props.ats.ariaLabel')">
    <h3>{{ t('props.ats.title') }}</h3>
    <CommitField
      :label="t('props.name')"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.element.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { label: v }), 'editor.history.changeAtsLabel')"
    />
    <CommitField
      :label="t('props.marking')"
      :maxlength="MAX_MARKING_LENGTH"
      :model-value="found.element.marking"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { marking: v }), 'editor.history.changeMarking')"
    />
    <CommitField
      :label="t('props.element.width')"
      type="number"
      :min="ATS_MIN_WIDTH"
      :model-value="found.element.widthModules"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(
            num(v),
            (n) => updateElement(id, { widthModules: n }),
            'editor.history.changeAtsWidth',
          )
      "
    />
    <label class="field">
      {{ t('props.ats.state') }}
      <select
        :value="found.element.state"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { state: (e.target as HTMLSelectElement).value as AtsState }),
              'editor.history.changeAtsState',
            )
        "
      >
        <option v-for="s in states" :key="s" :value="s">{{ atsStateName(s, t) }}</option>
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
              'editor.history.swapAtsSides',
            )
        "
      />
      {{ t('props.ats.swapped') }}
    </label>
    <p class="hint">{{ t('props.ats.hint') }}</p>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      {{ t('props.ats.delete') }}
    </button>
  </section>
</template>
