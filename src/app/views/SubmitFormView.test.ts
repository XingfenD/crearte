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
  const getGame = vi.fn()
  const state = { status: 'authenticated' as const, user: null as { username: string } | null }
  return { upload, createSubmission, getSubmission, updateSubmission, getGame, state }
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
  apiRepo: { getGame: h.getGame },
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

describe('SubmitFormView hosted 第三档', () => {
  const hostedGame = {
    id: 'alice/hosted-game', name: 'Hosted Game', runtime: 'hosted' as const,
    hostedUrl: 'https://games.example.com/play', fallback: 'hosted' as const,
    url: 'https://example.com/orig', description: '', durationMinutes: { min: 1, max: 2 },
    type: 'puzzle' as const, tags: [], entry: '', version: ''
  }

  it('hosted 提交形状：runtime + hostedUrl + fallback，不带 bundle/version/entry/features', async () => {
    h.state.user = alice
    h.createSubmission.mockResolvedValue({ id: 's1', kind: 'new_work', status: 'draft', work_id: 'alice/hosted-game', payload: {}, created_at: '', updated_at: '' })
    const w = mountForm()
    await w.find('#sf-name').setValue('Hosted Game')
    await w.find('[data-testid="runtime-hosted"]').setValue(true)
    await w.find('#sf-url').setValue('https://example.com/orig')
    await w.find('[data-testid="hosted-url"]').setValue('https://games.example.com/play')
    await flushPromises()
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).toHaveBeenCalledTimes(1)
    const body = h.createSubmission.mock.calls[0][0]
    expect(body.work_id).toBe('alice/hosted-game')
    expect(body.payload.runtime).toBe('hosted')
    expect(body.payload.hostedUrl).toBe('https://games.example.com/play')
    expect(body.payload.fallback).toBe('external')
    expect(body.payload.version).toBeUndefined()
    expect(body.payload.entry).toBeUndefined()
    expect(body.payload.features).toBeUndefined()
    expect(body.bundle_upload_id).toBe('')
  })

  it('hosted 缺 hostedUrl 被拦截；补 https 后 fallback=external 缺 url 仍被拦截', async () => {
    h.state.user = alice
    const w = mountForm()
    await w.find('#sf-name').setValue('Hosted Game')
    await w.find('[data-testid="runtime-hosted"]').setValue(true)
    await w.find('#sf-url').setValue('https://example.com/orig')
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).not.toHaveBeenCalled()
    expect(w.text()).toContain('自托管作品必须填写 https 播放链接')

    await w.find('[data-testid="hosted-url"]').setValue('http://insecure.example.com/play')
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).not.toHaveBeenCalled()
    expect(w.text()).toContain('自托管作品必须填写 https 播放链接')

    // 清空作品原始链接（fallback 仍为默认 external）→ url 必填面
    await w.find('[data-testid="hosted-url"]').setValue('https://games.example.com/play')
    await w.find('#sf-url').setValue('')
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).not.toHaveBeenCalled()
    expect(w.text()).toContain('降级方式为 external 时必须填写作品原始链接')
  })

  it('预填 hosted 作品：回填 runtime/hostedUrl/fallback（不再拒绝）', async () => {
    h.state.user = alice
    h.getGame.mockResolvedValue(hostedGame)
    const w = mountForm()
    await w.get('[data-testid="kind-select"]').trigger('click')
    const opt = w.findAll('[role=option]').find((o) => o.text().includes('元数据更新'))
    await opt!.trigger('click')
    await w.find('#sf-workid').setValue('hosted-game')
    await w.find('#sf-workid').trigger('blur')
    await flushPromises()
    expect((w.find('[data-testid="hosted-url"]').element as HTMLInputElement).value).toBe('https://games.example.com/play')
    expect((w.find('[data-testid="runtime-hosted"]').element as HTMLInputElement).checked).toBe(true)
    expect(w.get('[data-testid="fallback"]').text()).toContain('站内播放')
    expect(w.text()).not.toContain('暂不支持在此提交')
  })

  it('new_version 禁入 hosted：预填报文案且 hosted radio 禁用', async () => {
    h.state.user = alice
    h.getGame.mockResolvedValue(hostedGame)
    const w = mountForm()
    await w.get('[data-testid="kind-select"]').trigger('click')
    const opt = w.findAll('[role=option]').find((o) => o.text().includes('新版本'))
    await opt!.trigger('click')
    await w.find('#sf-workid').setValue('hosted-game')
    await w.find('#sf-workid').trigger('blur')
    await flushPromises()
    expect(w.text()).toContain('该作品不是 virtual 运行时，不能提交新版本')
    expect((w.find('[data-testid="runtime-hosted"]').element as HTMLInputElement).disabled).toBe(true)
    expect((w.find('[data-testid="runtime-virtual"]').element as HTMLInputElement).disabled).toBe(true)
  })
})

describe('SubmitFormView 运行权限五键（P8 ①）', () => {
  const NEW_KEYS = ['inlineStyle', 'wasm', 'coop', 'fullscreen', 'gamepad'] as const

  it('virtual 档渲染七键勾选框（含五个新开关，label/hint 非空）', async () => {
    h.state.user = alice
    const w = mountForm()
    await w.find('[data-testid="runtime-virtual"]').setValue(true)
    await flushPromises()
    for (const key of NEW_KEYS) {
      const box = w.find(`[data-testid="feature-${key}"]`)
      expect(box.exists()).toBe(true)
      const boxText = box.element.closest('label')?.textContent ?? ''
      expect(boxText.length).toBeGreaterThan(0)
    }
  })

  it('勾选新开关进入载荷：features 七键齐全且对应键为 true', async () => {
    h.state.user = alice
    h.createSubmission.mockResolvedValue({ id: 's1', kind: 'new_work', status: 'draft', work_id: 'alice/my-game', payload: {}, created_at: '', updated_at: '' })
    const w = mountForm()
    await w.find('[data-testid="runtime-virtual"]').setValue(true)
    await w.find('#sf-name').setValue('My Game')
    await w.find('[data-testid="version"]').setValue('v1')
    await w.find('[data-testid="feature-wasm"]').setValue(true)
    await w.find('[data-testid="feature-fullscreen"]').setValue(true)
    await flushPromises()
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).toHaveBeenCalledTimes(1)
    const features = h.createSubmission.mock.calls[0][0].payload.features
    expect(Object.keys(features).sort()).toEqual(['coop', 'eval', 'fullscreen', 'gamepad', 'inlineScript', 'inlineStyle', 'wasm'])
    expect(features.wasm).toBe(true)
    expect(features.fullscreen).toBe(true)
    expect(features.coop).toBe(false)
    expect(features.gamepad).toBe(false)
    expect(features.inlineStyle).toBe(false)
  })
})
