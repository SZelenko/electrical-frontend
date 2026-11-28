<script setup lang="ts">
import { mdiCheck, mdiClose, mdiPalette } from '@mdi/js'
import { useAppTheme } from '@/composables/useAppTheme'
import { ACCENTS } from '@/plugins/vuetify'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { THEME_MODES, THEME_PALETTES } from '@/theme'

const { mode, palette, isDark, notSaved, setMode, setPalette } = useAppTheme()
const auth = useAuthStore()
</script>

<template>
  <v-menu :close-on-content-click="false">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        :icon="mdiPalette"
        :aria-label="t('appearance.title')"
        :disabled="auth.status === 'unknown'"
        data-testid="appearance-menu"
        variant="text"
      />
    </template>
    <v-card min-width="260">
      <v-card-text>
        <div class="text-subtitle-2 mb-2" id="appearance-mode-label">
          {{ t('appearance.mode') }}
        </div>
        <v-btn-toggle
          :model-value="mode"
          mandatory
          density="comfortable"
          variant="outlined"
          divided
          role="group"
          aria-labelledby="appearance-mode-label"
          @update:model-value="setMode"
        >
          <v-btn
            v-for="m in THEME_MODES"
            :key="m"
            :value="m"
            :aria-pressed="m === mode"
            :data-testid="`mode-${m}`"
          >
            {{ t(`appearance.modes.${m}`) }}
          </v-btn>
        </v-btn-toggle>
        <div id="appearance-palette-label" class="text-subtitle-2 mt-4 mb-2">
          {{ t('appearance.palette') }}
        </div>
        <div class="swatches" role="group" aria-labelledby="appearance-palette-label">
          <v-btn
            v-for="p in THEME_PALETTES"
            :key="p"
            icon
            :color="ACCENTS[p][isDark ? 'dark' : 'light']"
            :aria-label="t(`appearance.palettes.${p}`)"
            :aria-pressed="p === palette"
            :data-testid="`palette-${p}`"
            :title="t(`appearance.palettes.${p}`)"
            size="small"
            variant="flat"
            @click="setPalette(p)"
          >
            <v-icon v-if="p === palette" :icon="mdiCheck" />
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
  <!-- at the top, under the app bar: it never covers the canvas -->
  <v-snackbar
    v-model="notSaved"
    :timeout="-1"
    location="top"
    color="error"
    :content-props="{ 'data-testid': 'theme-not-saved' }"
  >
    {{ t('app.themeNotSaved') }}
    <template #actions>
      <v-btn :aria-label="t('common.close')" :icon="mdiClose" @click="notSaved = false" />
    </template>
  </v-snackbar>
</template>

<style scoped>
.swatches {
  display: flex;
  gap: 0.75rem;
}
</style>
