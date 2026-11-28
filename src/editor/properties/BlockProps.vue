<script setup lang="ts">
import { computed } from 'vue'
import { moveBlockToOtherRow, updateBlock } from '@/domain/commands'
import {
  BLOCK_COLOURS,
  MAX_LABEL_LENGTH,
  MAX_RAIL_BLOCK_TERMINALS,
  MAX_ROW_BLOCK_TERMINALS,
} from '@/domain/limits'
import { colourName, type WireColour } from '@/domain/panelContent'
import { t } from '@/i18n'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.blocks.get(props.id))
const row = computed(() => found.value?.rail === null)
const rowId = computed(() => found.value?.row ?? null)
const colourValue = computed(() => found.value?.block.colour ?? '')

function setColour(value: string) {
  const colour = value === '' ? null : (value as WireColour)
  ctx.run(updateBlock(props.id, { colour }), 'editor.history.changeBlockColour')
}
</script>

<template>
  <section
    v-if="found"
    :aria-label="row ? t('props.block.ariaLabelRow') : t('props.block.ariaLabelRail')"
  >
    <h3>{{ row ? t('props.block.titleRow') : t('props.block.titleRail') }}</h3>
    <CommitField
      :label="t('props.name')"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.block.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateBlock(id, { label: v }), 'editor.history.changeBlockLabel')"
    />
    <label class="field">
      {{ t('props.colour') }}
      <select
        :value="colourValue"
        :disabled="store.readOnly"
        @change="(e) => setColour((e.target as HTMLSelectElement).value)"
      >
        <option v-for="c in BLOCK_COLOURS" :key="c ?? 'grey'" :value="c ?? ''">
          {{ c ? colourName(c, t) : t('domain.colour.grey') }}
        </option>
      </select>
    </label>
    <CommitField
      :label="t('props.block.terminalCount')"
      type="number"
      :min="1"
      :max="row ? MAX_ROW_BLOCK_TERMINALS : MAX_RAIL_BLOCK_TERMINALS"
      :model-value="found.block.terminalCount"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(
            num(v),
            (n) => updateBlock(id, { terminalCount: n }),
            'editor.history.changeTerminalCount',
          )
      "
    />
    <p v-if="row" class="hint">{{ t('props.block.rowWidth', { n: found.block.widthModules }) }}</p>
    <p v-else class="hint">{{ t('props.block.railWidth') }}</p>
    <template v-if="rowId">
      <p class="hint" data-testid="block-row">
        {{ t(`domain.rowTitle.${rowId}`) }}
      </p>
      <button
        type="button"
        :disabled="store.readOnly || ctx.translucent.value"
        data-testid="move-block-row"
        @click="ctx.run(moveBlockToOtherRow(id), 'editor.history.moveBlockRow')"
      >
        {{ rowId === 'top' ? t('props.block.moveToBottom') : t('props.block.moveToTop') }}
      </button>
    </template>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      {{ row ? t('props.block.deleteRow') : t('props.block.deleteRail') }}
    </button>
  </section>
</template>
