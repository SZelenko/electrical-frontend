<script setup lang="ts">
import { RouterView } from 'vue-router'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
</script>

<template>
  <header class="app-header">
    <LanguageSwitcher />
  </header>
  <RouterView />
</template>

<style scoped>
/* Overlays the top-right corner: it must not push the editor down (the canvas fits the viewport). */
.app-header {
  position: absolute;
  top: 0.4rem;
  right: 1rem;
  z-index: 10;
  max-width: min(22rem, calc(100vw - 2rem));
}
</style>
