<script setup lang="ts">
import { computed } from 'vue'
import { issuesOfBusbar, maxBusbarCount } from '@/domain/busbars'
import { updateBusbar } from '@/domain/commands'
import { BLOCK_COLOURS, MAX_BUSBAR_COUNT, MIN_BUSBAR_COUNT } from '@/domain/limits'
import { colourName, type BusbarType, type WireColour } from '@/domain/panelContent'
import { t } from '@/i18n'
import { busbarIssueText } from '../messages'
import CommitField from './CommitField.vue'
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

function onTypeChange(e: Event) {
  const select = e.target as HTMLSelectElement
  const outcome = ctx.run(
    updateBusbar(props.id, { type: select.value as BusbarType }),
    'editor.history.changeBusbarType',
  )
  // a rejected change leaves the model as it was: show the stored type again
  if (!outcome.ok && found.value) select.value = found.value.busbar.type
}
</script>

<template>
  <section v-if="found" :aria-label="t('props.busbar.ariaLabel')">
    <h3>{{ t('props.busbar.title') }}</h3>
    <label class="field">
      {{ t('props.busbar.type') }}
      <select :value="found.busbar.type" :disabled="store.readOnly" @change="onTypeChange">
        <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <label class="field">
      {{ t('props.colour') }}
      <select
        :value="found.busbar.colour ?? ''"
        :disabled="store.readOnly"
        @change="(e) => setColour((e.target as HTMLSelectElement).value)"
      >
        <option v-for="c in BLOCK_COLOURS" :key="c ?? 'grey'" :value="c ?? ''">
          {{ c ? colourName(c, t) : t('domain.colour.grey') }}
        </option>
      </select>
    </label>
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
    <p class="hint">{{ t('props.busbar.hint', { max: maxCount }) }}</p>
    <p v-if="found.busbar.type === 'LN'" class="hint">{{ t('props.busbar.hintLN') }}</p>
    <ul v-if="issues.length > 0" class="form-error" role="alert">
      <li v-for="issue in issues" :key="issue.kind">{{ busbarIssueText(issue.kind, t) }}</li>
    </ul>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      {{ t('props.busbar.delete') }}
    </button>
  </section>
</template>
