import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/games/:id', name: 'game', component: () => import('@/views/GameView.vue'), props: true },
    { path: '/docs', name: 'docs', component: () => import('@/views/DocsView.vue') },
    { path: '/docs/:slug', name: 'doc', component: () => import('@/views/DocsView.vue'), props: true },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  }
})
