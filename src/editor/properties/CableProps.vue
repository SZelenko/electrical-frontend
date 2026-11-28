<script setup lang="ts">
import { computed } from 'vue'
import {
  addCableWire,
  removeCableWire,
  removeInputCable,
  removeOutputCable,
  setOutputLoad,
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
import { colourName, OUTPUT_LOADS, type OutputLoad } from '@/domain/panelContent'
import { t } from '@/i18n'
import { newId } from '../newId'
import CommitField from './CommitField.vue'
import SelectField from './SelectField.vue'
import { useCommit } from './useCommit'

const props = defineProps<{ kind: 'inputCable' | 'outputCable'; id: string }>()
const { ctx, store, num, commit } = useCommit()
const colourItems = computed(() => WIRE_COLOURS.map((c) => ({ title: colourName(c, t), value: c })))
const loadItems = computed(() =>
  OUTPUT_LOADS.map((l) => ({ title: t(`domain.load.${l}`), value: l })),
)
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
    <h3 class="text-subtitle-1 mb-2">
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
    <SelectField
      v-if="output"
      :label="t('props.cable.load')"
      :items="loadItems"
      :model-value="output.cable.load"
      :disabled="store.readOnly"
      @update:model-value="
        (v: OutputLoad) => ctx.run(setOutputLoad(id, v), 'editor.history.changeOutputLoad')
      "
    />
    <fieldset class="wires">
      <legend class="text-body-2">{{ t('props.cable.wires') }}</legend>
      <div v-for="(wire, i) in cable.wires" :key="wire.id" class="d-flex ga-2 align-center mb-2">
        <SelectField
          :label="t('props.cable.wireColour', { n: i + 1 })"
          :model-value="wire.colour"
          :items="colourItems"
          :disabled="store.readOnly"
          @update:model-value="
            (colour) =>
              ctx.run(updateCableWire(wire.id, { colour }), 'editor.history.changeCableWireColour')
          "
        />
        <v-btn
          type="button"
          size="small"
          :disabled="store.readOnly || cable.wires.length <= 1"
          :title="
            cable.wires.length <= 1 ? t('props.cable.deleteWireLast') : t('props.cable.deleteWire')
          "
          :aria-label="t('props.cable.deleteWireLabel', { n: i + 1 })"
          @click="ctx.run(removeCableWire(wire.id), 'editor.history.removeCableWire')"
        >
          {{ t('common.delete') }}
        </v-btn>
      </div>
      <v-btn
        type="button"
        size="small"
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
      </v-btn>
    </fieldset>
    <v-btn
      type="button"
      size="small"
      color="error"
      class="mt-2"
      :disabled="store.readOnly || (kind === 'inputCable' && inputCount <= 1)"
      :title="
        kind === 'inputCable' && inputCount <= 1 ? t('props.cable.deleteLastInput') : undefined
      "
      @click="removeCable"
    >
      {{ t('props.cable.delete') }}
    </v-btn>
  </section>
</template>
