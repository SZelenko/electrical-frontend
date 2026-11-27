<script setup lang="ts">
import { computed } from 'vue'
import { updateRail } from '@/domain/commands'
import CommitField from './CommitField.vue'
import RailWidthField from './RailWidthField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const found = computed(() => store.index?.rails.get(props.id))
</script>

<template>
  <section v-if="found" aria-label="Властивості рейки">
    <h3>Рейка {{ found.index + 1 }}</h3>
    <RailWidthField />
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
