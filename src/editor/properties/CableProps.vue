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
import {
  MAX_CABLE_LABEL_LENGTH,
  MAX_CABLE_WIRES,
  MAX_DESCRIPTION_LENGTH,
  WIRE_COLOURS,
} from '@/domain/limits'
import { colourName, type WireColour } from '@/domain/panelContent'
import { t } from '@/i18n'
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
    props.kind === 'inputCable'
      ? 'editor.history.removeInputCable'
      : 'editor.history.removeOutputCable',
  )
}
</script>

<template>
  <section
    v-if="cable"
    :aria-label="
      kind === 'inputCable' ? t('props.cable.ariaLabelInput') : t('props.cable.ariaLabelOutput')
    "
  >
    <h3>
      {{ kind === 'inputCable' ? t('props.cable.titleInput') : t('props.cable.titleOutput') }}
      {{ index + 1 }}
    </h3>
    <CommitField
      :label="t('props.cable.mark')"
      :maxlength="MAX_CABLE_LABEL_LENGTH"
      :model-value="cable.label"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          ctx.run(
            kind === 'inputCable'
              ? updateInputCable(id, { label: v })
              : updateOutputCable(id, { label: v }),
            'editor.history.changeCableLabel',
          )
      "
    />
    <template v-if="input">
      <CommitField
        :label="t('props.cable.voltage')"
        type="number"
        step="0.1"
        :model-value="input.cable.voltage"
        :disabled="store.readOnly"
        @commit="
          (v) =>
            commit(
              num(v),
              (n) => updateInputCable(id, { voltage: n }),
              'editor.history.changeVoltage',
            )
        "
      />
      <CommitField
        :label="t('props.cable.frequency')"
        type="number"
        step="0.01"
        :model-value="input.cable.frequency"
        :disabled="store.readOnly"
        @commit="
          (v) =>
            commit(
              num(v),
              (n) => updateInputCable(id, { frequency: n }),
              'editor.history.changeFrequency',
            )
        "
      />
      <CommitField
        :label="t('props.cable.crossSection')"
        type="number"
        step="0.01"
        :model-value="input.cable.crossSection"
        :disabled="store.readOnly"
        @commit="
          (v) =>
            commit(
              num(v),
              (n) => updateInputCable(id, { crossSection: n }),
              'editor.history.changeCableCrossSection',
            )
        "
      />
    </template>
    <CommitField
      v-else-if="output"
      :label="t('props.cable.description')"
      :maxlength="MAX_DESCRIPTION_LENGTH"
      :model-value="output.cable.description"
      :disabled="store.readOnly"
      @commit="
        (v) =>
          ctx.run(
            updateOutputCable(id, { description: v }),
            'editor.history.changeCableDescription',
          )
      "
    />
    <fieldset>
      <legend>{{ t('props.cable.wires') }}</legend>
      <div v-for="(wire, i) in cable.wires" :key="wire.id" class="row">
        <label>
          {{ t('props.cable.wireColour', { n: i + 1 }) }}
          <select
            :value="wire.colour"
            :disabled="store.readOnly"
            @change="
              (e) =>
                ctx.run(
                  updateCableWire(wire.id, {
                    colour: (e.target as HTMLSelectElement).value as WireColour,
                  }),
                  'editor.history.changeCableWireColour',
                )
            "
          >
            <option v-for="c in WIRE_COLOURS" :key="c" :value="c">{{ colourName(c, t) }}</option>
          </select>
        </label>
        <button
          type="button"
          :disabled="store.readOnly || cable.wires.length <= 1"
          :title="
            cable.wires.length <= 1 ? t('props.cable.deleteWireLast') : t('props.cable.deleteWire')
          "
          :aria-label="t('props.cable.deleteWireLabel', { n: i + 1 })"
          @click="ctx.run(removeCableWire(wire.id), 'editor.history.removeCableWire')"
        >
          {{ t('common.delete') }}
        </button>
      </div>
      <button
        type="button"
        :disabled="store.readOnly || cable.wires.length >= MAX_CABLE_WIRES"
        :title="
          cable.wires.length >= MAX_CABLE_WIRES
            ? t('props.cable.addWireLimit', { max: MAX_CABLE_WIRES })
            : t('props.cable.addWireTitle')
        "
        @click="
          ctx.run(addCableWire(id, { id: newId(), colour: 'blue' }), 'editor.history.addCableWire')
        "
      >
        {{ t('props.cable.addWire') }}
      </button>
    </fieldset>
    <button
      type="button"
      :disabled="store.readOnly || (kind === 'inputCable' && inputCount <= 1)"
      :title="
        kind === 'inputCable' && inputCount <= 1 ? t('props.cable.deleteLastInput') : undefined
      "
      @click="removeCable"
    >
      {{ t('props.cable.delete') }}
    </button>
  </section>
</template>
