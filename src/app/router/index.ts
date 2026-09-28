import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { authEnabled, session } from '@/auth'
import { resolveNavigation } from './guards'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/LandingView.vue') },
  { path: '/games', name: 'catalog', component: () => import('@/views/CatalogView.vue') },
  { path: '/games/:user/:slug', name: 'game', component: () => import('@/views/GameView.vue'), props: true },
  { path: '/docs', name: 'docs', component: () => import('@/views/DocsView.vue') },
  { path: '/docs/:slug', name: 'doc', component: () => import('@/views/DocsView.vue'), props: true },
  { path: '/out', name: 'outbound', component: () => import('@/views/OutboundView.vue') },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
  { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
  { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { requiresAuth: true } },
  { path: '/submit', name: 'submit', component: () => import('@/views/SubmitListView.vue'), meta: { requiresAuth: true } },
  { path: '/submit/new', name: 'submit-new', component: () => import('@/views/SubmitFormView.vue'), meta: { requiresAuth: true } },
  { path: '/submit/:id', name: 'submit-edit', component: () => import('@/views/SubmitFormView.vue'), props: true, meta: { requiresAuth: true } },
  { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/submissions/:id', name: 'admin-submission', component: () => import('@/views/AdminSubmissionView.vue'), props: true, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  }
})

router.beforeEach((to) =>
  resolveNavigation(to, {
    authEnabled,
    authenticated: session.state.status === 'authenticated',
    isAdmin: session.state.user?.role === 'admin'
  })
)
