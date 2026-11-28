<script setup lang="ts">
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js'

/** The aria-label props take message keys: Vuetify translates them through the vue-i18n adapter. */
defineProps<{ page: number; pages: number }>()
defineEmits<{ change: [page: number] }>()
</script>

<template>
  <v-pagination
    v-if="pages > 1"
    :model-value="page"
    :length="pages"
    :total-visible="5"
    aria-label="panels.pagination.label"
    previous-aria-label="common.back"
    next-aria-label="common.next"
    page-aria-label="panels.pagination.goToPage"
    current-page-aria-label="panels.pagination.currentPage"
    :prev-icon="mdiChevronLeft"
    :next-icon="mdiChevronRight"
    density="comfortable"
    class="mt-4"
    @update:model-value="$emit('change', $event)"
  />
</template>
