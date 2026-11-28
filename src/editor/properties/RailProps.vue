<script setup lang="ts">
import { computed } from 'vue'
import { updateRail } from '@/domain/commands'
import { t } from '@/i18n'
import CommitField from './CommitField.vue'
import RailWidthField from './RailWidthField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.rails.get(props.id))
</script>

<template>
  <section v-if="found" :aria-label="t('props.rail.ariaLabel')">
    <h3>{{ t('props.rail.title', { n: found.index + 1 }) }}</h3>
    <RailWidthField />
    <CommitField
      :label="t('props.rail.spacing')"
      type="number"
      :min="0"
      step="0.1"
      :model-value="found.rail.spacingMm"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(
            num(v),
            (n) => updateRail(id, { spacingMm: n }),
            'editor.history.changeRailSpacing',
          )
      "
    />
    <p class="hint">{{ t('props.rail.hint') }}</p>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      {{ t('props.rail.delete') }}
    </button>
  </section>
</template>
