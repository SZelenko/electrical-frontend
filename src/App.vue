<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppearanceMenu from '@/components/AppearanceMenu.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { t } from '@/i18n'
</script>

<template>
  <v-app>
    <v-app-bar density="compact" flat border="b">
      <v-app-bar-title class="app-title">{{ t('app.title') }}</v-app-bar-title>
      <LanguageSwitcher />
      <AppearanceMenu />
    </v-app-bar>
    <!-- a div: the views own the single <main> landmark -->
    <v-main tag="div">
      <RouterView />
    </v-main>
  </v-app>
</template>

<style scoped>
.app-title {
  font-size: 1rem;
}
</style>
