<script setup lang="ts">
import { setRailWidth } from '@/domain/commands'
import { MAX_RAIL_WIDTH, MIN_RAIL_WIDTH } from '@/domain/limits'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

/** The width of every rail (a panel-wide property); also bounds the terminal row. */
const { store, num, commit } = useCommit()
</script>

<template>
  <CommitField
    v-if="store.content"
    label="Ширина рейок (усіх), модулів"
    type="number"
    :min="MIN_RAIL_WIDTH"
    :max="MAX_RAIL_WIDTH"
    :model-value="store.content.railWidthModules"
    :disabled="store.readOnly"
    @commit="(v) => commit(num(v), (n) => setRailWidth(n), 'Змінити ширину рейок')"
  />
</template>
