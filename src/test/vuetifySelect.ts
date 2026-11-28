import { nextTick } from 'vue'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { VSelect } from 'vuetify/components'

type Root = Pick<VueWrapper, 'findAllComponents'> | Pick<DOMWrapper<Element>, 'findAllComponents'>

/**
 * `v-select` in component tests. Its menu is teleported and opens through pointer events, so the
 * tests drive it through its model instead: read `value(select)`, change it with `choose`.
 */
export function selectsIn(root: Root) {
  return (root as Pick<VueWrapper, 'findAllComponents'>).findAllComponents(VSelect)
}

/** The select with this label (or the only one when no label is given). */
export function selectIn(root: Root, label?: string) {
  const all = selectsIn(root)
  const found =
    label === undefined
      ? all[0]
      : all.find((s) => (s.props() as Record<string, unknown>).label === label)
  if (!found) throw new Error(`No v-select${label ? ` labelled "${label}"` : ''}`)
  return found
}

export const selectValue = (select: VueWrapper) =>
  (select.props() as Record<string, unknown>).modelValue
export const selectDisabled = (select: VueWrapper) =>
  !!(select.props() as Record<string, unknown>).disabled

/** Picks an item as the user would: the select emits its new model value. */
export async function choose(select: VueWrapper, value: unknown): Promise<void> {
  select.vm.$emit('update:modelValue', value)
  await nextTick()
}
