import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, matchedRouteKey, type Router } from 'vue-router'
import { computed, type Component } from 'vue'
import { vuetify } from '@/plugins/vuetify'

const Stub = { template: '<div />' }

/** `global` mount options for a route view mounted without a RouterView (see `mountView`). */
export function viewGlobal(pinia: Pinia, router: Router) {
  const matched = computed(() => router.currentRoute.value.matched[0])
  return { plugins: [pinia, router, vuetify], provide: { [matchedRouteKey as symbol]: matched } }
}

/** Mounts a route view with a real Pinia store and a memory router that has all auth route names. */
export async function mountView(
  view: Component,
  path = '/',
  props: Record<string, unknown> = {},
  setup?: (pinia: Pinia) => void,
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  setup?.(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/account', name: 'account', component: Stub },
      { path: '/login', name: 'login', component: Stub },
      { path: '/register', name: 'register', component: Stub },
      { path: '/verify-email', name: 'verify-email', component: Stub },
      { path: '/two-factor', name: 'two-factor', component: Stub },
      { path: '/trash', name: 'trash', component: Stub },
      { path: '/panels/:id', name: 'panel', component: Stub },
      { path: '/test', name: 'test', component: view },
    ],
  })
  await router.push(path === '/' ? '/test' : path)
  await router.isReady()
  // The view is mounted directly (no RouterView): provide the matched record so that
  // onBeforeRouteLeave/Update register their guards instead of warning "No active route record".
  const wrapper = mount(view, { props, global: viewGlobal(pinia, router) })
  return { wrapper, router, pinia }
}

export { flushPromises }
