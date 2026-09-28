// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import SubmitFormView from './SubmitFormView.vue'

const h = vi.hoisted(() => {
  const upload = vi.fn()
  const createSubmission = vi.fn()
  const getSubmission = vi.fn()
  const updateSubmission = vi.fn()
  const state = { status: 'authenticated' as const, user: null as { username: string } | null }
  return { upload, createSubmission, getSubmission, updateSubmission, state }
})

vi.mock('@/auth', () => ({
  session: { state: h.state, getToken: () => 'tok', invalidate: vi.fn() }
}))

vi.mock('@/content', () => ({
  contentClient: {
    upload: h.upload,
    createSubmission: h.createSubmission,
    getSubmission: h.getSubmission,
    updateSubmission: h.updateSubmission
  },
  toContentMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  validateUploadInput: () => null
}))

vi.mock('@/data', () => ({
  apiRepo: { getGame: vi.fn() },
  NotFoundError: class NotFoundError extends Error {}
}))

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  h.state.user = null
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/submit/new', name: 'submit-new', component: { template: '<div />' } },
      { path: '/submit', name: 'submit', component: { template: '<div />' } }
    ]
  })
  await router.push('/submit/new')
})

function mountForm() {
  return mount(SubmitFormView, {
    global: {
      plugins: [router],
      stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
    }
  })
}

const alice = { username: 'alice' }

describe('SubmitFormView 命名空间提交', () => {
  it('作品链接提示按本人 username 与 slug 拼装', async () => {
    h.state.user = alice
    const w = mountForm()
    await w.find('[data-testid="work-id"]').setValue('my-game')
    expect(w.text()).toContain('/games/alice/my-game')
  })

  it('username 缺失时链接提示降级为占位', () => {
    const w = mountForm()
    expect(w.text()).toContain('/games/<你的用户名>/<名称>')
  })

  it('存草稿以 username/slug 复合 work_id 与 payload.id 提交', async () => {
    h.state.user = alice
    h.createSubmission.mockResolvedValue({ id: 's1', kind: 'new_work', status: 'draft', work_id: 'alice/my-game', payload: {}, created_at: '', updated_at: '' })
    const w = mountForm()
    await w.find('#sf-name').setValue('My Game')
    await w.find('#sf-url').setValue('https://example.com')
    await w.find('#sf-author').setValue('A')
    await w.find('#sf-desc').setValue('desc')
    await flushPromises()
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).toHaveBeenCalledTimes(1)
    const body = h.createSubmission.mock.calls[0][0]
    expect(body.work_id).toBe('alice/my-game')
    expect(body.payload.id).toBe('alice/my-game')
  })
})

describe('SubmitFormView 三字段可选（作者/描述/链接）', () => {
  it('virtual 提交省略空的 url/author/description', async () => {
    h.state.user = alice
    h.createSubmission.mockResolvedValue({ id: 's1', kind: 'new_work', status: 'draft', work_id: 'alice/my-game', payload: {}, created_at: '', updated_at: '' })
    const w = mountForm()
    await w.find('[data-testid="runtime-virtual"]').setValue(true)
    await w.find('#sf-name').setValue('My Game')
    await w.find('[data-testid="version"]').setValue('v1')
    await flushPromises()
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).toHaveBeenCalledTimes(1)
    const body = h.createSubmission.mock.calls[0][0]
    expect(body.payload.url).toBeUndefined()
    expect(body.payload.author).toBeUndefined()
    expect(body.payload.description).toBeUndefined()
  })

  it('external 缺 url 被保存拦截并提示', async () => {
    h.state.user = alice
    const w = mountForm()
    await w.find('#sf-name').setValue('My Game')
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).not.toHaveBeenCalled()
    expect(w.text()).toContain('外链作品必须填写作品原始链接')
  })
})
