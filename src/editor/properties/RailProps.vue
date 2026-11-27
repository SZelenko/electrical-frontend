<script setup lang="ts">
import { computed } from 'vue'
import { updateRail } from '@/domain/commands'
import { MAX_RAIL_WIDTH } from '@/domain/limits'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.rails.get(props.id))
</script>

<template>
  <section v-if="found" aria-label="Властивості рейки">
    <h3>Рейка {{ found.index + 1 }}</h3>
    <CommitField
      label="Ширина, модулів"
      type="number"
      :min="1"
      :max="MAX_RAIL_WIDTH"
      :model-value="found.rail.widthModules"
      :disabled="store.readOnly"
      @commit="
        (v) => commit(num(v), (n) => updateRail(id, { widthModules: n }), 'Змінити ширину рейки')
      "
    />
    <CommitField
      label="Відстань від попередньої рейки, мм"
      type="number"
      :min="0"
      step="0.1"
      :model-value="found.rail.spacingMm"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(num(v), (n) => updateRail(id, { spacingMm: n }), 'Змінити відстань між рейками')
      "
    />
    <p class="hint">Відстань рахується між осями рейок (для першої — від верху зони рейок).</p>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      Видалити рейку
    </button>
  </section>
</template>
