<script setup lang="ts">
import { setCableSides } from '@/domain/commands'
import { CABLE_SIDES } from '@/domain/panelContent'
import { t } from '@/i18n'
import RailWidthField from './RailWidthField.vue'
import { useCommit } from './useCommit'

const { ctx, store } = useCommit()

function setSide(kind: 'input' | 'output', e: Event) {
  const select = e.target as HTMLSelectElement
  const side = CABLE_SIDES.find((s) => s === select.value)
  if (!side) return
  const outcome = ctx.run(setCableSides({ [kind]: side }), 'editor.history.changeCableSides')
  // a rejected change must not leave the rejected option showing
  if (!outcome.ok && store.content) select.value = store.content[`${kind}CableSide`]
}
</script>

<template>
  <section :aria-label="t('props.panel.ariaLabel')">
    <h3>{{ t('props.panel.title') }}</h3>
    <RailWidthField />
    <template v-if="store.content">
      <label class="field">
        {{ t('props.panel.inputSide') }}
        <select
          :value="store.content.inputCableSide"
          :disabled="store.readOnly"
          data-testid="input-cable-side"
          @change="(e) => setSide('input', e)"
        >
          <option v-for="s in CABLE_SIDES" :key="s" :value="s">
            {{ t(`props.panel.side.${s}`) }}
          </option>
        </select>
      </label>
      <label class="field">
        {{ t('props.panel.outputSide') }}
        <select
          :value="store.content.outputCableSide"
          :disabled="store.readOnly"
          data-testid="output-cable-side"
          @change="(e) => setSide('output', e)"
        >
          <option v-for="s in CABLE_SIDES" :key="s" :value="s">
            {{ t(`props.panel.side.${s}`) }}
          </option>
        </select>
      </label>
    </template>
    <p class="hint">{{ t('props.panel.hintWidth') }}</p>
    <p class="hint">{{ t('props.panel.hintSelect') }}</p>
  </section>
</template>
