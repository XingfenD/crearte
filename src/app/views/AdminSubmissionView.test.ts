// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AdminSubmissionView from './AdminSubmissionView.vue'

const h = vi.hoisted(() => ({ getSubmission: vi.fn() }))

vi.mock('@/content', () => ({
  contentClient: { getSubmission: h.getSubmission },
  toContentMessage: (e: unknown) => (e instanceof Error ? e.message : String(e))
}))

const RouterLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

function baseSub(features: Record<string, boolean>) {
  return {
    id: 'sub-1', kind: 'new_work', status: 'pending', work_id: 'alice/my-game',
    payload: {
      id: 'alice/my-game', name: 'G', url: '', author: { name: 'a' }, description: 'd',
      durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], runtime: 'virtual',
      version: 'v1', features
    },
    created_at: '', updated_at: ''
  }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/submissions/:id', component: { template: '<div />' } }]
  })
  await router.push('/admin/submissions/sub-1')
  await router.isReady()
  return mount(AdminSubmissionView, {
    props: { id: 'sub-1' },
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } }
  })
}

beforeEach(() => vi.clearAllMocks())

describe('AdminSubmissionView 运行权限只读展示（P8 ①）', () => {
  it('五个新开关勾选时展示对应中文 label', async () => {
    h.getSubmission.mockResolvedValue(baseSub({ wasm: true, coop: true, fullscreen: true, gamepad: true, inlineStyle: true }))
    const w = await mountView()
    await flushPromises()
    const text = w.get('[data-testid="payload-features"]').text()
    expect(text).toContain('允许 WebAssembly')
    expect(text).toContain('允许跨源隔离')
    expect(text).toContain('允许全屏')
    expect(text).toContain('允许游戏手柄')
    expect(text).toContain('允许内联样式')
    expect(text).not.toContain('未声明额外权限')
  })

  it('七键全 false → 空态文案（未额外放宽）', async () => {
    h.getSubmission.mockResolvedValue(baseSub({
      eval: false, inlineScript: false, inlineStyle: false, wasm: false, coop: false, fullscreen: false, gamepad: false
    }))
    const w = await mountView()
    await flushPromises()
    expect(w.get('[data-testid="payload-features"]').text()).toContain('未声明额外权限')
  })
})
