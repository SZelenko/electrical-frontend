<script setup lang="ts">
import { computed } from 'vue'
import { issuesOfBusbar, maxBusbarCount } from '@/domain/busbars'
import { updateBusbar } from '@/domain/commands'
import { BLOCK_COLOURS, MAX_BUSBAR_COUNT, MIN_BUSBAR_COUNT } from '@/domain/limits'
import { colourName, type BusbarType, type WireColour } from '@/domain/panelContent'
import { t } from '@/i18n'
import { busbarIssueText } from '../messages'
import CommitField from './CommitField.vue'
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.busbars.get(props.id))
const issues = computed(() => (found.value ? issuesOfBusbar(found.value.rail, props.id) : []))
const maxCount = computed(() =>
  found.value
    ? Math.max(
        found.value.busbar.count,
        maxBusbarCount(found.value.rail, found.value.busbar.firstElementId, props.id),
      )
    : MAX_BUSBAR_COUNT,
)
const typeOptions: { value: BusbarType; label: string }[] = [
  { value: 'L', label: 'L' },
  { value: 'LN', label: 'L+N' },
]

function setColour(value: string) {
  const colour = value === '' ? null : (value as WireColour)
  ctx.run(updateBusbar(props.id, { colour }), 'editor.history.changeBusbarColour')
}

// a rejected change leaves the model as it was, so the select keeps showing the stored type
function onTypeChange(type: BusbarType) {
  ctx.run(updateBusbar(props.id, { type }), 'editor.history.changeBusbarType')
}
const typeItems = typeOptions.map((o) => ({ title: o.label, value: o.value }))
const colourItems = computed(() =>
  BLOCK_COLOURS.map((c) => ({
    title: c ? colourName(c, t) : t('domain.colour.grey'),
    value: c ?? '',
  })),
)
</script>

<template>
  <section v-if="found" :aria-label="t('props.busbar.ariaLabel')">
    <h3 class="text-subtitle-1 mb-2">{{ t('props.busbar.title') }}</h3>
    <SelectField
      :label="t('props.busbar.type')"
      :model-value="found.busbar.type"
      :items="typeItems"
      :disabled="store.readOnly"
      @update:model-value="onTypeChange"
    />
    <SelectField
      :label="t('props.colour')"
      :model-value="found.busbar.colour ?? ''"
      :items="colourItems"
      :disabled="store.readOnly"
      @update:model-value="setColour"
    />
    <CommitField
      :label="t('props.busbar.count')"
      type="number"
      :min="MIN_BUSBAR_COUNT"
      :max="maxCount"
      :model-value="found.busbar.count"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(num(v), (n) => updateBusbar(id, { count: n }), 'editor.history.changeBusbarLength')
      "
    />
    <p class="hint text-caption text-medium-emphasis">
      {{ t('props.busbar.hint', { max: maxCount }) }}
    </p>
    <p v-if="found.busbar.type === 'LN'" class="hint text-caption text-medium-emphasis">
      {{ t('props.busbar.hintLN') }}
    </p>
    <v-alert
      v-if="issues.length > 0"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-2 text-body-2"
    >
      <ul class="ps-4">
        <li v-for="issue in issues" :key="issue.kind">{{ busbarIssueText(issue.kind, t) }}</li>
      </ul>
    </v-alert>
    <v-btn
      type="button"
      size="small"
      color="error"
      :disabled="store.readOnly"
      @click="ctx.deleteSelected"
    >
      {{ t('props.busbar.delete') }}
    </v-btn>
  </section>
</template>
