<script setup lang="ts">
import { computed, useId } from 'vue'
import { setPoleTransit, updateElement } from '@/domain/commands'
import { DEVICE_STYLE_DEFAULTS } from '@/domain/deviceStyles'
import { DEVICE_STYLES, MAX_LABEL_LENGTH, MAX_MARKING_LENGTH } from '@/domain/limits'
import type { DeviceStyle } from '@/domain/panelContent'
import { t } from '@/i18n'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ id: string }>()
const { ctx, store, num, commit } = useCommit()
const styleId = useId()
const found = computed(() => {
  const f = store.index?.elements.get(props.id)
  return f && f.element.kind === 'device' ? { ...f, element: f.element } : undefined
})
</script>

<template>
  <section v-if="found" :aria-label="t('props.element.ariaLabel')">
    <h3>{{ t('props.element.title') }}</h3>
    <div class="field">
      <label :for="styleId">{{ t('props.element.style') }}</label>
      <select
        :id="styleId"
        :value="found.element.style"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { style: (e.target as HTMLSelectElement).value as DeviceStyle }),
              'editor.history.changeElementStyle',
            )
        "
      >
        <option v-for="s in DEVICE_STYLES" :key="s" :value="s">
          {{ t(DEVICE_STYLE_DEFAULTS[s].titleKey) }}
        </option>
      </select>
    </div>
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
    <label class="check">
      <input
        type="checkbox"
        :checked="found.element.on"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { on: (e.target as HTMLInputElement).checked }),
              'editor.history.toggleElement',
            )
        "
      />
      {{ t('props.element.on') }}
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="found.element.sidesSwapped"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { sidesSwapped: (e.target as HTMLInputElement).checked }),
              'editor.history.swapSides',
            )
        "
      />
      {{ t('props.element.swapped') }}
    </label>
    <fieldset>
      <legend>{{ t('props.element.transit') }}</legend>
      <label v-for="(pole, i) in found.element.poles" :key="i" class="check">
        <input
          type="checkbox"
          :checked="pole.transit"
          :disabled="store.readOnly"
          @change="
            (e) =>
              ctx.run(
                setPoleTransit(id, i, (e.target as HTMLInputElement).checked),
                'editor.history.transitPole',
              )
          "
        />
        {{ t('props.element.pole', { n: i + 1 }) }}
      </label>
    </fieldset>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      {{ t('props.element.delete') }}
    </button>
  </section>
</template>
