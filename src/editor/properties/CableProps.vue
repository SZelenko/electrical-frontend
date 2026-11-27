<script setup lang="ts">
import { computed } from 'vue'
import {
  addCableWire,
  removeCableWire,
  removeInputCable,
  removeOutputCable,
  updateCableWire,
  updateInputCable,
  updateOutputCable,
} from '@/domain/commands'
import { MAX_CABLE_WIRES, MAX_DESCRIPTION_LENGTH, WIRE_COLOURS } from '@/domain/limits'
import { colourName, type WireColour } from '@/domain/panelContent'
import { newId } from '../newId'
import CommitField from './CommitField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ kind: 'inputCable' | 'outputCable'; id: string }>()
const { ctx, store, num, commit } = useCommit()
const inputCount = computed(() => store.content?.inputCables.length ?? 0)

const input = computed(() =>
  props.kind === 'inputCable' ? store.index?.inputCables.get(props.id) : undefined,
)
const output = computed(() =>
  props.kind === 'outputCable' ? store.index?.outputCables.get(props.id) : undefined,
)
const cable = computed(() => input.value?.cable ?? output.value?.cable)
const index = computed(() => input.value?.index ?? output.value?.index ?? 0)

function removeCable() {
  ctx.run(
    props.kind === 'inputCable' ? removeInputCable(props.id) : removeOutputCable(props.id),
    props.kind === 'inputCable' ? 'Видалити вхідний кабель' : 'Видалити вихідний кабель',
  )
}
</script>

<template>
  <section
    v-if="cable"
    :aria-label="
      kind === 'inputCable' ? 'Властивості вхідного кабелю' : 'Властивості вихідного кабелю'
    "
  >
    <h3>{{ kind === 'inputCable' ? 'Вхідний кабель' : 'Вихідний кабель' }} {{ index + 1 }}</h3>
    <template v-if="input">
      <CommitField
        label="Напруга, В"
        type="number"
        step="0.1"
        :model-value="input.cable.voltage"
        :disabled="store.readOnly"
        @commit="
          (v) => commit(num(v), (n) => updateInputCable(id, { voltage: n }), 'Змінити напругу')
        "
      />
      <CommitField
        label="Частота, Гц"
        type="number"
        step="0.01"
        :model-value="input.cable.frequency"
        :disabled="store.readOnly"
        @commit="
          (v) => commit(num(v), (n) => updateInputCable(id, { frequency: n }), 'Змінити частоту')
        "
      />
      <CommitField
        label="Переріз, мм²"
        type="number"
        step="0.01"
        :model-value="input.cable.crossSection"
        :disabled="store.readOnly"
        @commit="
          (v) =>
            commit(
              num(v),
              (n) => updateInputCable(id, { crossSection: n }),
              'Змінити переріз кабелю',
            )
        "
      />
    </template>
    <CommitField
      v-else-if="output"
      label="Опис"
      :maxlength="MAX_DESCRIPTION_LENGTH"
      :model-value="output.cable.description"
      :disabled="store.readOnly"
      @commit="(v) => ctx.run(updateOutputCable(id, { description: v }), 'Змінити опис кабелю')"
    />
    <fieldset>
      <legend>Проводи кабелю</legend>
      <div v-for="(wire, i) in cable.wires" :key="wire.id" class="row">
        <label>
          Колір проводу {{ i + 1 }}
          <select
            :value="wire.colour"
            :disabled="store.readOnly"
            @change="
              (e) =>
                ctx.run(
                  updateCableWire(wire.id, {
                    colour: (e.target as HTMLSelectElement).value as WireColour,
                  }),
                  'Змінити колір проводу кабелю',
                )
            "
          >
            <option v-for="c in WIRE_COLOURS" :key="c" :value="c">{{ colourName(c) }}</option>
          </select>
        </label>
        <button
          type="button"
          :disabled="store.readOnly || cable.wires.length <= 1"
          :title="
            cable.wires.length <= 1
              ? 'Не можна видалити останній провід кабелю'
              : 'Видалити провід кабелю'
          "
          :aria-label="`Видалити провід ${i + 1} кабелю`"
          @click="ctx.run(removeCableWire(wire.id), 'Видалити провід кабелю')"
        >
          Видалити
        </button>
      </div>
      <button
        type="button"
        :disabled="store.readOnly || cable.wires.length >= MAX_CABLE_WIRES"
        :title="
          cable.wires.length >= MAX_CABLE_WIRES
            ? 'Кабель може мати не більше 4 проводів'
            : 'Додати провід до кабелю'
        "
        @click="
          ctx.run(addCableWire(id, { id: newId(), colour: 'blue' }), 'Додати провід до кабелю')
        "
      >
        Додати провід кабелю
      </button>
    </fieldset>
    <button
      type="button"
      :disabled="store.readOnly || (kind === 'inputCable' && inputCount <= 1)"
      :title="
        kind === 'inputCable' && inputCount <= 1
          ? 'Не можна видалити останній вхідний кабель'
          : undefined
      "
      @click="removeCable"
    >
      Видалити кабель
    </button>
  </section>
</template>
