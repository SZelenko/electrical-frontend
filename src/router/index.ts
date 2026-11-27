import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/trash',
      name: 'trash',
      component: () => import('../views/TrashView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/panels/:id',
      name: 'panel',
      component: () => import('../views/PanelView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('../views/VerifyEmailView.vue'),
    },
    {
      path: '/two-factor',
      name: 'two-factor',
      component: () => import('../views/TwoFactorView.vue'),
      beforeEnter: () => (useAuthStore().twoFactorToken === null ? { name: 'login' } : true),
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'home' }
  }
  return true
})

/** When a refresh fails mid-session, send the user to login and come back afterwards. */
export function watchSessionLoss() {
  const auth = useAuthStore()
  watch(
    () => auth.status,
    (status) => {
      const current = router.currentRoute.value
      if (status === 'reloginNeeded' && current.meta.requiresAuth) {
        void router.push({ name: 'login', query: { redirect: current.fullPath } })
      }
    },
  )
}

export default router
