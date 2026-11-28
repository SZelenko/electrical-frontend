<script setup lang="ts">
/**
 * A message with a tone: `role="status"` (polite) for info and success, `role="alert"` for errors.
 * `v-alert` is always `role="alert"`, so it stays for blocking errors with a form-level meaning.
 */
defineProps<{ tone: 'info' | 'success' | 'error' }>()
</script>

<template>
  <v-sheet
    :role="tone === 'error' ? 'alert' : 'status'"
    rounded
    border
    class="status-note pa-2"
    :class="`text-${tone}`"
  >
    <slot />
  </v-sheet>
</template>
