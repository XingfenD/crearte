// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import SubmitFormView from './SubmitFormView.vue'

// 每个用例后卸载 wrapper：否则早前用例改过表单的组件会残留 beforeunload 监听，污染后续断言
enableAutoUnmount(afterEach)

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

describe('SubmitFormView 脏表单离开守卫（P10 T2）', () => {
  const GUARD = '表单尚未保存，确定离开吗？未保存的修改将丢失。'

  // happy-dom 未实现 window.confirm（默认 undefined），直接赋一个可观测的 stub
  function stubConfirm(returnValue: boolean) {
    const fn = vi.fn().mockReturnValue(returnValue)
    Object.defineProperty(window, 'confirm', { value: fn, configurable: true, writable: true })
    return fn
  }

  // onBeforeRouteLeave 只有挂在 <router-view> 内的组件才注册到路由记录（直挂根组件不注册守卫）
  async function mountRouted(path = '/submit/new') {
    const r = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/submit/new', name: 'submit-new', component: SubmitFormView },
        { path: '/submit/:id', name: 'submit-edit', component: SubmitFormView, props: true },
        { path: '/submit', name: 'submit', component: { template: '<div>submit-list</div>' } },
        { path: '/games', name: 'catalog', component: { template: '<div>games</div>' } }
      ]
    })
    await r.push(path)
    await r.isReady()
    const w = mount(defineComponent({ components: { RouterView }, template: '<RouterView />' }), {
      global: { plugins: [r] }
    })
    await flushPromises()
    return { w, router: r }
  }

  it('改动表单后导航被 confirm(false) 拒绝并停留，confirm(true) 放行', async () => {
    h.state.user = alice
    const { w, router } = await mountRouted('/submit/new')
    await w.find('#sf-name').setValue('My Game')
    await flushPromises()
    const confirmSpy = stubConfirm(false)
    await router.push('/games')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(GUARD)
    expect(router.currentRoute.value.path).toBe('/submit/new')

    confirmSpy.mockReturnValue(true)
    await router.push('/games')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/games')
  })

  it('未改动的干净表单直接放行，不弹 confirm', async () => {
    h.state.user = alice
    const { router } = await mountRouted('/submit/new')
    const confirmSpy = stubConfirm(false)
    await router.push('/games')
    await flushPromises()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/games')
  })

  it('编辑模式 loadExisting 回填不置脏：导航直通且不弹 confirm', async () => {
    h.state.user = alice
    h.getSubmission.mockResolvedValue({
      id: 'sub-1', kind: 'new_work', status: 'draft', work_id: 'alice/my-game',
      payload: {
        id: 'alice/my-game', name: 'My Game', url: 'https://example.com',
        durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: []
      },
      created_at: '', updated_at: ''
    })
    const { router } = await mountRouted('/submit/sub-1')
    await flushPromises()
    const confirmSpy = stubConfirm(false)
    await router.push('/games')
    await flushPromises()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/games')
  })

  it('存草稿成功 push 直通：suppressLeave 抑制守卫，confirm 未被调', async () => {
    h.state.user = alice
    h.createSubmission.mockResolvedValue({ id: 's1', kind: 'new_work', status: 'draft', work_id: 'alice/my-game', payload: {}, created_at: '', updated_at: '' })
    const { w, router } = await mountRouted('/submit/new')
    const confirmSpy = stubConfirm(false)
    await w.find('#sf-name').setValue('My Game')
    await w.find('#sf-url').setValue('https://example.com')
    await flushPromises()
    await w.get('[data-testid="save-draft"]').trigger('click')
    await flushPromises()
    expect(h.createSubmission).toHaveBeenCalledTimes(1)
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/submit')
  })

  it('脏表单拦截 beforeunload；干净表单不拦截', async () => {
    h.state.user = alice
    const { w } = await mountRouted('/submit/new')
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    await w.find('#sf-name').setValue('My Game')
    await flushPromises()
    const dirtyEvt = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvt)
    expect(dirtyEvt.defaultPrevented).toBe(true)
  })

  it('bundle 上传成功即置脏（离开需确认）', async () => {
    h.state.user = alice
    h.getSubmission.mockResolvedValue({
      id: 'sub-1', kind: 'new_work', status: 'draft', work_id: 'alice/my-game',
      payload: {
        id: 'alice/my-game', name: 'My Game', durationMinutes: { min: 1, max: 2 }, type: 'puzzle',
        tags: [], runtime: 'virtual', version: 'v1', entry: 'index.html'
      },
      created_at: '', updated_at: ''
    })
    h.upload.mockResolvedValue({ upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 1024, kid: 'k'.repeat(22) })
    const { w, router } = await mountRouted('/submit/sub-1')
    await flushPromises()

    const input = w.get('[data-testid="bundle-file"]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['zip'], 'b.zip', { type: 'application/zip' })], configurable: true })
    await w.get('[data-testid="bundle-file"]').trigger('change')
    await flushPromises()
    expect(h.upload).toHaveBeenCalledTimes(1)

    const confirmSpy = stubConfirm(false)
    await router.push('/games')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(GUARD)
    expect(router.currentRoute.value.path).toBe('/submit/sub-1')
  })
})
