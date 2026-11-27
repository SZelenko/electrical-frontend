<script setup lang="ts">
defineProps<{ page: number; pages: number }>()
defineEmits<{ change: [page: number] }>()
</script>

<template>
  <nav v-if="pages > 1" class="pagination" aria-label="Сторінки">
    <button type="button" :disabled="page <= 1" @click="$emit('change', page - 1)">Назад</button>
    <span aria-current="page">Сторінка {{ page }} з {{ pages }}</span>
    <button type="button" :disabled="page >= pages" @click="$emit('change', page + 1)">Далі</button>
  </nav>
</template>
