import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { Component } from 'vue'
import { i18n } from '@/i18n'
import { vuetify } from '@/plugins/vuetify'

type Options = ComponentMountingOptions<Component> & { pinia?: Pinia }

/**
 * Mounts a component with Vuetify, i18n and Pinia installed. Vuetify overlays (menus, dialogs)
 * teleport to `document.body`: query them through `document` / `within(document.body)` and prefer
 * role/label queries over Vuetify class names. Mount into a `v-app` (see `withApp`) for layout parts.
 */
export function mountWithPlugins(component: Component, options: Options = {}) {
  const { pinia = createPinia(), global, ...rest } = options
  setActivePinia(pinia)
  const wrapper = mount(component, {
    ...rest,
    global: { ...global, plugins: [pinia, i18n, vuetify, ...(global?.plugins ?? [])] },
  })
  return { wrapper, pinia }
}

/** Like `mountWithPlugins`, for tests that only need the wrapper. */
export const mountPlugins = (component: Component, options: Options = {}) =>
  mountWithPlugins(component, options).wrapper
