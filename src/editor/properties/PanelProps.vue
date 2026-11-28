<script setup lang="ts">
import { setCableSides } from '@/domain/commands'
import { CABLE_SIDES, type CableSide } from '@/domain/panelContent'
import RailWidthField from './RailWidthField.vue'
import { useCommit } from './useCommit'

const { ctx, store } = useCommit()

const SIDE_NAMES: Record<CableSide, string> = {
  top: 'Зверху',
  bottom: 'Знизу',
  left: 'Зліва',
  right: 'Справа',
}

function setSide(kind: 'input' | 'output', e: Event) {
  const select = e.target as HTMLSelectElement
  const side = CABLE_SIDES.find((s) => s === select.value)
  if (!side) return
  const outcome = ctx.run(setCableSides({ [kind]: side }), 'Змінити сторону кабелів')
  // a rejected change must not leave the rejected option showing
  if (!outcome.ok && store.content) select.value = store.content[`${kind}CableSide`]
}
</script>

<template>
  <section aria-label="Властивості щита">
    <h3>Щит</h3>
    <RailWidthField />
    <template v-if="store.content">
      <label class="field">
        Сторона вхідних кабелів
        <select
          :value="store.content.inputCableSide"
          :disabled="store.readOnly"
          data-testid="input-cable-side"
          @change="(e) => setSide('input', e)"
        >
          <option v-for="s in CABLE_SIDES" :key="s" :value="s">{{ SIDE_NAMES[s] }}</option>
        </select>
      </label>
      <label class="field">
        Сторона вихідних кабелів
        <select
          :value="store.content.outputCableSide"
          :disabled="store.readOnly"
          data-testid="output-cable-side"
          @change="(e) => setSide('output', e)"
        >
          <option v-for="s in CABLE_SIDES" :key="s" :value="s">{{ SIDE_NAMES[s] }}</option>
        </select>
      </label>
    </template>
    <p class="hint">
      Ширина однакова для всіх рейок і обох рядів клемників. Кабелі на одній стороні йдуть підряд:
      спочатку вхідні, потім вихідні.
    </p>
    <p class="hint">Виберіть рейку, апарат, шину, клемний блок, кабель або провід на схемі.</p>
  </section>
</template>
