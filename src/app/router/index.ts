import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router'
import { authEnabled, session } from '@/auth'
import { joinTitle, sectionTitleOf, setPageDescription, setPageTitle } from '@/lib/pageTitle'
import { resolveNavigation } from './guards'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/LandingView.vue') },
  { path: '/creator', name: 'creator', component: () => import('@/views/CreatorCenterView.vue') },
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
  { path: '/admin/users', name: 'admin-users', component: () => import('@/views/AdminUsersView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/audit', name: 'admin-audit', component: () => import('@/views/AdminAuditView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/users/:user', name: 'author', component: () => import('@/views/AuthorView.vue'), props: true },
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

// 两段式标题的静态基线：导航落地后按路由名设段标题。数据页再 watch 数据精化覆盖。
// description 同步复位：每次导航先回落默认文案，game 页由 GameView watch 再精化（spec D-C 离开恢复，
// 且避免 game→game 切换时旧作品描述残留）。抽成函数导出，测试 makeRouter 新实例才能挂同一钩子。
// SPA 导航后把焦点交给主内容区：读屏用户据此获得新页面上下文（D-E）。
// 仅路径变化时移动——同路径改 query（如目录 /games?tag=x 筛选）不打断用户焦点。
// preventScroll：滚动由 router.scrollBehavior 负责，避免双重滚动抖动。
export function focusMain(): void {
  document.getElementById('main')?.focus({ preventScroll: true })
}

export function attachTitleHook(r: Router): void {
  r.afterEach((to, from) => {
    setPageTitle(joinTitle(sectionTitleOf(to.name)))
    setPageDescription('')
    if (to.path !== from.path) focusMain()
  })
}

attachTitleHook(router)
