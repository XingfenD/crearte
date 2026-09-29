// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// 预览组件读会话 token 拼进 fragment（SW 据此带 Authorization 拉取带鉴权的上传端点）
vi.mock('@/auth', () => ({
  session: { getToken: () => 'session-token', state: { status: 'authenticated', user: null } },
  authEnabled: true
}))

import SubmissionPreview from './SubmissionPreview.vue'
import type { PreviewSource } from '@/content/preview'

const source: PreviewSource = {
  payload: {
    id: 'tester/my-game', name: 'My Game', runtime: 'virtual', version: 'v1',
    durationMinutes: { min: 5, max: 20 }, type: 'puzzle', tags: []
  },
  upload: { id: 'up-1', sha256: 'a'.repeat(64), bytes: 2048, kid: 'k'.repeat(22), playSubdomain: '0123456789abcdef' }
}

function fragmentOf(src: string): URLSearchParams {
  return new URLSearchParams(new URL(src).hash.replace(/^#/, ''))
}

describe('SubmissionPreview', () => {
  it('复用 GameHost：iframe 指向上传预览端点并带会话 token', () => {
    const wrapper = mount(SubmissionPreview, { props: { source } })
    const src = wrapper.get('iframe').attributes('src')!
    const params = fragmentOf(src)
    const origin = location.origin
    expect(params.get('bundle')).toBe(`${origin}/api/uploads/up-1/bundle`)
    expect(params.get('key')).toBe(`${origin}/api/uploads/up-1/bundle-key`)
    expect(params.get('kid')).toBe('k'.repeat(22))
    expect(params.get('t')).toBe('session-token')
    expect(src).toContain('/__bootstrap#')
    // 游玩子域 = sha256(work_id) 确定性派生（后端 previewUploadFromSubmission 下发）；
    // 基域取构建期 VITE_GAMES_BASE_DOMAIN（测试环境未注入 → 默认 games.example.com）
    expect(new URL(src).hostname).toBe('0123456789abcdef.games.example.com')
  })

  it('表单/审核页内联场景不渲染「退出」按钮（目录详情页专属）', () => {
    const wrapper = mount(SubmissionPreview, { props: { source } })
    expect(wrapper.findAll('button').some((b) => b.text() === '退出')).toBe(false)
  })

  it('不可预览的输入（非 virtual）不挂载播放器', () => {
    const wrapper = mount(SubmissionPreview, {
      props: { source: { ...source, payload: { ...source.payload, runtime: 'external' } } }
    })
    expect(wrapper.find('iframe').exists()).toBe(false)
  })
})
