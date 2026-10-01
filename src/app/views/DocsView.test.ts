// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { joinTitle, sectionTitleOf, setPageTitle } from '@/lib/pageTitle'
import DocsView from './DocsView.vue'

const h = vi.hoisted(() => ({ listDocs: vi.fn(), getDoc: vi.fn() }))

vi.mock('@/data', () => ({ repo: { listDocs: h.listDocs, getDoc: h.getDoc } }))

const meta = [
  { slug: 'intro', title: '入门', order: 1 },
  { slug: 'advanced', title: '进阶', order: 2 }
]

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  document.title = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/docs', name: 'docs', component: { template: '<div />' } },
      { path: '/docs/:slug', name: 'doc', component: { template: '<div />' } }
    ]
  })
  // 模拟真实 afterEach 基线钩子
  router.afterEach((to) => setPageTitle(joinTitle(sectionTitleOf(to.name))))
})

function mountDocs(slug?: string) {
  return mount(DocsView, {
    props: slug ? { slug } : {},
    global: {
      plugins: [router],
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="$router.resolve(to).href"><slot /></a>' },
        DocSidebar: true,
        DocToc: true
      }
    }
  })
}

describe('DocsView 标题精化', () => {
  it('无 slug 时保持「文档」基线', async () => {
    h.listDocs.mockResolvedValue(meta)
    h.getDoc.mockResolvedValue(null)
    await router.push('/docs/intro')
    mountDocs()
    await flushPromises()
    expect(document.title).toBe('文档 · crearte 创艺')
  })

  it('文档就绪后精化为文档名', async () => {
    h.listDocs.mockResolvedValue(meta)
    h.getDoc.mockResolvedValue({ slug: 'intro', title: '入门', order: 1, content: '# 入门' })
    await router.push('/docs/intro')
    mountDocs('intro')
    await flushPromises()
    expect(document.title).toBe('入门 · 文档 · crearte 创艺')
  })
})
