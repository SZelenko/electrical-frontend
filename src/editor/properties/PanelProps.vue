<script setup lang="ts">
import { setCableSides } from '@/domain/commands'
import { computed } from 'vue'
import { CABLE_SIDES, type CableSide } from '@/domain/panelContent'
import { t } from '@/i18n'
import RailWidthField from './RailWidthField.vue'
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const { ctx, store } = useCommit()

// a rejected change leaves the model as it was, so the select keeps showing the stored side
function setSide(kind: 'input' | 'output', side: CableSide) {
  ctx.run(setCableSides({ [kind]: side }), 'editor.history.changeCableSides')
}
const sideItems = computed(() =>
  CABLE_SIDES.map((s) => ({ title: t(`props.panel.side.${s}`), value: s })),
)
</script>

<template>
  <section :aria-label="t('props.panel.ariaLabel')">
    <h3 class="text-subtitle-1 mb-2">{{ t('props.panel.title') }}</h3>
    <RailWidthField />
    <template v-if="store.content">
      <SelectField
        :label="t('props.panel.inputSide')"
        :model-value="store.content.inputCableSide"
        :items="sideItems"
        :disabled="store.readOnly"
        data-testid="input-cable-side"
        @update:model-value="(side) => setSide('input', side)"
      />
      <SelectField
        :label="t('props.panel.outputSide')"
        :model-value="store.content.outputCableSide"
        :items="sideItems"
        :disabled="store.readOnly"
        data-testid="output-cable-side"
        @update:model-value="(side) => setSide('output', side)"
      />
    </template>
    <p class="hint text-caption text-medium-emphasis">{{ t('props.panel.hintWidth') }}</p>
    <p class="hint text-caption text-medium-emphasis">{{ t('props.panel.hintSelect') }}</p>
  </section>
</template>
