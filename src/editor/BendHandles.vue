<script setup lang="ts">
import type { Pt } from '@/domain/geometry'
import { t } from '@/i18n'

defineProps<{ wireId: string; bends: readonly Pt[] }>()
</script>

<template>
  <g>
    <circle
      v-for="(b, k) in bends"
      :key="k"
      :cx="b.x"
      :cy="b.y"
      r="30"
      class="bend"
      data-kind="bend"
      data-testid="bend"
      :data-wire-id="wireId"
      :data-index="k"
    >
      <title>{{ t('editor.shape.bend', { n: k + 1 }) }}</title>
    </circle>
  </g>
</template>

<style scoped>
.bend {
  fill: var(--schematic-sheet);
  stroke: var(--schematic-selection);
  stroke-width: 10;
  cursor: move;
}
</style>
