<script setup lang="ts">
import { computed, useId } from 'vue'
import { setPoleTransit, updateElement } from '@/domain/commands'
import { DEVICE_STYLE_DEFAULTS } from '@/domain/deviceStyles'
import { DEVICE_STYLES, MAX_LABEL_LENGTH, MAX_MARKING_LENGTH } from '@/domain/limits'
import type { DeviceStyle } from '@/domain/panelContent'
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
  <section v-if="found" aria-label="Властивості апарата">
    <h3>Апарат</h3>
    <div class="field">
      <label :for="styleId">Стиль</label>
      <select
        :id="styleId"
        :value="found.element.style"
        :disabled="store.readOnly"
        @change="
          (e) =>
            ctx.run(
              updateElement(id, { style: (e.target as HTMLSelectElement).value as DeviceStyle }),
              'Змінити стиль апарата',
            )
        "
      >
        <option v-for="s in DEVICE_STYLES" :key="s" :value="s">
          {{ DEVICE_STYLE_DEFAULTS[s].title }}
        </option>
      </select>
    </div>
    <CommitField
      label="Назва"
      :maxlength="MAX_LABEL_LENGTH"
      :model-value="found.element.label"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { label: v }), 'Змінити назву апарата')"
    />
    <CommitField
      label="Маркування"
      :maxlength="MAX_MARKING_LENGTH"
      :model-value="found.element.marking"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateElement(id, { marking: v }), 'Змінити маркування')"
    />
    <CommitField
      label="Ширина, модулів"
      type="number"
      :min="1"
      :model-value="found.element.widthModules"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(num(v), (n) => updateElement(id, { widthModules: n }), 'Змінити ширину апарата')
      "
    />
    <CommitField
      label="Кількість полюсів"
      type="number"
      :min="1"
      :model-value="found.element.poles.length"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          commit(num(v), (n) => updateElement(id, { poleCount: n }), 'Змінити кількість полюсів')
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
              'Перемкнути апарат',
            )
        "
      />
      Увімкнено
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
              'Поміняти вхід і вихід',
            )
        "
      />
      Вхід знизу, вихід зверху
    </label>
    <fieldset>
      <legend>Транзитні полюси</legend>
      <label v-for="(pole, i) in found.element.poles" :key="i" class="check">
        <input
          type="checkbox"
          :checked="pole.transit"
          :disabled="store.readOnly"
          @change="
            (e) =>
              ctx.run(
                setPoleTransit(id, i, (e.target as HTMLInputElement).checked),
                'Транзитний полюс',
              )
          "
        />
        Полюс {{ i + 1 }}
      </label>
    </fieldset>
    <button type="button" :disabled="store.readOnly" @click="ctx.deleteSelected">
      Видалити апарат
    </button>
  </section>
</template>
