<script setup lang="ts">
import { computed } from 'vue'
import { issuesOfBusbar, maxBusbarCount } from '@/domain/busbars'
import { updateBusbar } from '@/domain/commands'
import { BLOCK_COLOURS, MAX_BUSBAR_COUNT, MIN_BUSBAR_COUNT } from '@/domain/limits'
import { colourName, type BusbarType, type WireColour } from '@/domain/panelContent'
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
  ctx.run(updateBusbar(props.id, { colour }), 'Змінити колір шини')
}

function onTypeChange(e: Event) {
  const select = e.target as HTMLSelectElement
  const outcome = ctx.run(
    updateBusbar(props.id, { type: select.value as BusbarType }),
    'Змінити тип шини',
  )
  // a rejected change leaves the model as it was: show the stored type again
  if (!outcome.ok && found.value) select.value = found.value.busbar.type
}
</script>

<template>
  <section v-if="found" aria-label="Властивості шини">
    <h3>Шина</h3>
    <label class="field">
      Тип
      <select :value="found.busbar.type" :disabled="store.readOnly" @change="onTypeChange">
        <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <label class="field">
      Колір
      <select
        :value="found.busbar.colour ?? ''"
        :disabled="store.readOnly"
        @change="(e) => setColour((e.target as HTMLSelectElement).value)"
      >
        <option v-for="c in BLOCK_COLOURS" :key="c ?? 'grey'" :value="c ?? ''">
          {{ c ? colourName(c) : 'сірий' }}
        </option>
      </select>
    </label>
    <CommitField
      label="Кількість апаратів"
      type="number"
      :min="MIN_BUSBAR_COUNT"
      :max="maxCount"
      :model-value="found.busbar.count"
      :disabled="store.readOnly"
      @commit="(v) => commit(num(v), (n) => updateBusbar(id, { count: n }), 'Змінити довжину шини')"
    />
    <p class="hint">
      Шина охоплює вибраний апарат і суміжні апарати праворуч (до {{ maxCount }}). Тип L+N: друга
      клема з’єднується з другим полюсом. Довжину можна змінити перетягуванням правого краю.
    </p>
    <p v-if="found.busbar.type === 'LN'" class="hint">
      Перехід на L видалить проводи, підключені до виводу N.
    </p>
    <ul v-if="issues.length > 0" class="form-error" role="alert">
      <li v-for="issue in issues" :key="issue.kind">{{ busbarIssueText(issue.kind) }}</li>
    </ul>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      Видалити шину
    </button>
  </section>
</template>
