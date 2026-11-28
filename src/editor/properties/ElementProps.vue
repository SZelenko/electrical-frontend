<script setup lang="ts">
import { computed } from 'vue'
import { setPoleTransit, updateElement } from '@/domain/commands'
import { DEVICE_STYLE_DEFAULTS } from '@/domain/deviceStyles'
import { DEVICE_STYLES, MAX_LABEL_LENGTH, MAX_MARKING_LENGTH } from '@/domain/limits'
import { t } from '@/i18n'
import CommitField from './CommitField.vue'
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const styleItems = computed(() =>
  DEVICE_STYLES.map((s) => ({
    title: t(DEVICE_STYLE_DEFAULTS[s].titleKey),
    value: s,
  })),
)
const found = computed(() => {
  const f = store.index?.elements.get(props.id)
  return f && f.element.kind === 'device' ? { ...f, element: f.element } : undefined
})
</script>

<template>
  <section v-if="found" :aria-label="t('props.element.ariaLabel')">
    <h3 class="text-subtitle-1 mb-2">{{ t('props.element.title') }}</h3>
    <SelectField
      :label="t('props.element.style')"
      :model-value="found.element.style"
      :items="styleItems"
      :disabled="store.readOnly"
      @update:model-value="
        (style) => ctx.run(updateElement(id, { style }), 'editor.history.changeElementStyle')
      "
    />
    <CommitField
      :label="t('props.name')"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.element.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { label: v }), 'editor.history.changeElementLabel')"
    />
    <CommitField
      :label="t('props.marking')"
      :maxlength="MAX_MARKING_LENGTH"
      :model-value="found.element.marking"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { marking: v }), 'editor.history.changeMarking')"
    />
    <CommitField
      :label="t('props.element.width')"
      type="number"
      :min="1"
      :model-value="found.element.widthModules"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(
            num(v),
            (n) => updateElement(id, { widthModules: n }),
            'editor.history.changeElementWidth',
          )
      "
    />
    <CommitField
      :label="t('props.element.poleCount')"
      type="number"
      :min="1"
      :model-value="found.element.poles.length"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(
            num(v),
            (n) => updateElement(id, { poleCount: n }),
            'editor.history.changePoleCount',
          )
      "
    />
    <v-checkbox
      :label="t('props.element.on')"
      :model-value="found.element.on"
      :disabled="store.readOnly"
      density="compact"
      hide-details
      @update:model-value="
        (v) => ctx.run(updateElement(id, { on: !!v }), 'editor.history.toggleElement')
      "
    />
    <v-checkbox
      :label="t('props.element.swapped')"
      :model-value="found.element.sidesSwapped"
      :disabled="store.readOnly"
      density="compact"
      hide-details
      @update:model-value="
        (v) => ctx.run(updateElement(id, { sidesSwapped: !!v }), 'editor.history.swapSides')
      "
    />
    <fieldset class="transit">
      <legend class="text-body-2">{{ t('props.element.transit') }}</legend>
      <v-checkbox
        v-for="(pole, i) in found.element.poles"
        :key="i"
        :label="t('props.element.pole', { n: i + 1 })"
        :model-value="pole.transit"
        :disabled="store.readOnly"
        density="compact"
        hide-details
        @update:model-value="
          (v) => ctx.run(setPoleTransit(id, i, !!v), 'editor.history.transitPole')
        "
      />
    </fieldset>
    <v-btn
      type="button"
      size="small"
      color="error"
      class="mt-2"
      :disabled="store.readOnly"
      @click="ctx.deleteSelected"
    >
      {{ t('props.element.delete') }}
    </v-btn>
  </section>
</template>
