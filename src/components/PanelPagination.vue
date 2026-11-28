<script setup lang="ts">
import { t } from '@/i18n'

defineProps<{ page: number; pages: number }>()
defineEmits<{ change: [page: number] }>()
</script>

<template>
  <nav v-if="pages > 1" class="pagination" :aria-label="t('panels.pagination.label')">
    <button type="button" :disabled="page <= 1" @click="$emit('change', page - 1)">
      {{ t('common.back') }}
    </button>
    <span aria-current="page">{{ t('panels.pagination.page', { page, pages }) }}</span>
    <button type="button" :disabled="page >= pages" @click="$emit('change', page + 1)">
      {{ t('common.next') }}
    </button>
  </nav>
</template>
