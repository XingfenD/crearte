import { createRouter, createWebHistory } from 'vue-router'
import { session } from '@/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/games/:id', name: 'game', component: () => import('@/views/GameView.vue'), props: true },
    { path: '/docs', name: 'docs', component: () => import('@/views/DocsView.vue') },
    { path: '/docs/:slug', name: 'doc', component: () => import('@/views/DocsView.vue'), props: true },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
    { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  }
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth === true && session.state.status !== 'authenticated') {
    return { name: 'login', query: { next: to.fullPath } }
  }
  return true
})
