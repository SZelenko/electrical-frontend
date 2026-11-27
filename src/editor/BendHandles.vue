<script setup lang="ts">
import type { Pt } from '@/domain/geometry'

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
      <title>Злам {{ k + 1 }}: перетягніть; подвійний клік — видалити</title>
    </circle>
  </g>
</template>

<style scoped>
.bend {
  fill: #fff;
  stroke: #0a64d6;
  stroke-width: 10;
  cursor: move;
}
</style>
