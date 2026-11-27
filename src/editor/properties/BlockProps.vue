<script setup lang="ts">
import { computed } from 'vue'
import { updateBlock } from '@/domain/commands'
import {
  BLOCK_COLOURS,
  MAX_LABEL_LENGTH,
  MAX_RAIL_BLOCK_TERMINALS,
  MAX_ROW_BLOCK_TERMINALS,
} from '@/domain/limits'
import { colourName, type WireColour } from '@/domain/panelContent'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.blocks.get(props.id))
const row = computed(() => found.value?.rail === null)
const colourValue = computed(() => found.value?.block.colour ?? '')

function setColour(value: string) {
  const colour = value === '' ? null : (value as WireColour)
  ctx.run(updateBlock(props.id, { colour }), 'Змінити колір клемника')
}
</script>

<template>
  <section
    v-if="found"
    :aria-label="row ? 'Властивості клемника в рядку' : 'Властивості клемного блока'"
  >
    <h3>{{ row ? 'Клемник у рядку' : 'Клемний блок' }}</h3>
    <CommitField
      label="Назва"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.block.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateBlock(id, { label: v }), 'Змінити назву клемника')"
    />
    <label class="field">
      Колір
      <select
        :value="colourValue"
        :disabled="store.readOnly"
        @change="(e) => setColour((e.target as HTMLSelectElement).value)"
      >
        <option v-for="c in BLOCK_COLOURS" :key="c ?? 'grey'" :value="c ?? ''">
          {{ c ? colourName(c) : 'сірий' }}
        </option>
      </select>
    </label>
    <CommitField
      label="Кількість клем"
      type="number"
      :min="1"
      :max="row ? MAX_ROW_BLOCK_TERMINALS : MAX_RAIL_BLOCK_TERMINALS"
      :model-value="found.block.terminalCount"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(num(v), (n) => updateBlock(id, { terminalCount: n }), 'Змінити кількість клем')
      "
    />
    <p v-if="row" class="hint">
      Ширина: {{ found.block.widthModules }} мод. (половина клем, з округленням угору).
    </p>
    <p v-else class="hint">Клемний блок на рейці завжди займає 1 модуль.</p>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      {{ row ? 'Видалити клемник' : 'Видалити клемний блок' }}
    </button>
  </section>
</template>
