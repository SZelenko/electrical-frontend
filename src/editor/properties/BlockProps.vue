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
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.blocks.get(props.id))
const row = computed(() => found.value?.rail === null)
const rowId = computed(() => found.value?.row ?? null)
const colourValue = computed(() => found.value?.block.colour ?? '')
const colourItems = computed(() =>
  BLOCK_COLOURS.map((c) => ({
    title: c ? colourName(c, t) : t('domain.colour.grey'),
    value: c ?? '',
  })),
)

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
    <h3 class="text-subtitle-1 mb-2">
      {{ row ? t('props.block.titleRow') : t('props.block.titleRail') }}
    </h3>
    <CommitField
      :label="t('props.name')"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.block.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateBlock(id, { label: v }), 'editor.history.changeBlockLabel')"
    />
    <SelectField
      :label="t('props.colour')"
      :model-value="colourValue"
      :items="colourItems"
      :disabled="store.readOnly"
      @update:model-value="setColour"
    />
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
    <p v-if="row" class="hint text-caption text-medium-emphasis">
      {{ t('props.block.rowWidth', { n: found.block.widthModules }) }}
    </p>
    <p v-else class="hint text-caption text-medium-emphasis">{{ t('props.block.railWidth') }}</p>
    <template v-if="rowId">
      <p class="hint text-caption text-medium-emphasis" data-testid="block-row">
        {{ t(`domain.rowTitle.${rowId}`) }}
      </p>
      <v-btn
        type="button"
        size="small"
        class="mr-2 mb-2"
        :disabled="store.readOnly || ctx.translucent.value"
        data-testid="move-block-row"
        @click="ctx.run(moveBlockToOtherRow(id), 'editor.history.moveBlockRow')"
      >
        {{ rowId === 'top' ? t('props.block.moveToBottom') : t('props.block.moveToTop') }}
      </v-btn>
    </template>
    <v-btn
      type="button"
      size="small"
      color="error"
      :disabled="store.readOnly"
      @click="ctx.deleteSelected"
    >
      {{ row ? t('props.block.deleteRow') : t('props.block.deleteRail') }}
    </v-btn>
  </section>
</template>
