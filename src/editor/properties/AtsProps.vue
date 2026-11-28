<script setup lang="ts">
import { computed } from 'vue'
import { updateElement } from '@/domain/commands'
import { ATS_MIN_WIDTH, MAX_LABEL_LENGTH, MAX_MARKING_LENGTH } from '@/domain/limits'
import { atsStateName, type AtsState } from '@/domain/panelContent'
import { t } from '@/i18n'
import CommitField from './CommitField.vue'
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => {
  const f = store.index?.elements.get(props.id)
  return f && f.element.kind === 'ats' ? { ...f, element: f.element } : undefined
})
const states: readonly AtsState[] = ['A', 'B', 'off']
const stateItems = computed(() => states.map((s) => ({ title: atsStateName(s, t), value: s })))
</script>

<template>
  <section v-if="found" :aria-label="t('props.ats.ariaLabel')">
    <h3 class="text-subtitle-1 mb-2">{{ t('props.ats.title') }}</h3>
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
    <SelectField
      :label="t('props.ats.state')"
      :model-value="found.element.state"
      :items="stateItems"
      :disabled="store.readOnly"
      @update:model-value="
        (v) => ctx.run(updateElement(id, { state: v }), 'editor.history.changeAtsState')
      "
    />
    <v-checkbox
      :label="t('props.ats.swapped')"
      :model-value="found.element.sidesSwapped"
      :disabled="store.readOnly"
      density="compact"
      hide-details
      @update:model-value="
        (v) => ctx.run(updateElement(id, { sidesSwapped: !!v }), 'editor.history.swapAtsSides')
      "
    />
    <p class="hint text-caption text-medium-emphasis">{{ t('props.ats.hint') }}</p>
    <v-btn
      type="button"
      size="small"
      color="error"
      :disabled="store.readOnly"
      @click="ctx.deleteSelected"
    >
      {{ t('props.ats.delete') }}
    </v-btn>
  </section>
</template>
