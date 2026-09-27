import { describe, expect, test, vi } from 'vitest'
import { NotFoundError, type ContentRepository } from './repository'
import { MergeContentRepository } from './mergeRepo'
import type { Game, GameSummary } from './types'

function summary(id: string, name = id): GameSummary {
  return { id, name, url: `https://u/${id}`, author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27' }
}
function game(id: string): Game { return summary(id) }

function stub(impl: Partial<ContentRepository>): ContentRepository {
  return {
    listGames: async () => [],
    getGame: async () => { throw new NotFoundError('x') },
    listDocs: async () => [],
    getDoc: async () => { throw new NotFoundError('x') },
    ...impl
  }
}

describe('MergeContentRepository.listGames', () => {
  test('并集，同 id API 胜出，source 标注', async () => {
    const api = stub({ listGames: async () => [summary('dup', 'API 版'), summary('api-only')] })
    const stat = stub({ listGames: async () => [summary('dup', '静态版'), summary('static-only')] })
    const games = await new MergeContentRepository(api, stat).listGames()
    expect(games.map((g) => g.id).sort()).toEqual(['api-only', 'dup', 'static-only'])
    const dup = games.find((g) => g.id === 'dup')!
    expect(dup.name).toBe('API 版')
    expect(dup.source).toBe('api')
    expect(games.find((g) => g.id === 'static-only')!.source).toBe('static')
    expect(games.find((g) => g.id === 'api-only')!.source).toBe('api')
  })

  test('API 失败 → console.warn + 纯静态', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = stub({ listGames: async () => { throw new Error('boom') } })
    const stat = stub({ listGames: async () => [summary('s1')] })
    const games = await new MergeContentRepository(api, stat).listGames()
    expect(games.map((g) => g.id)).toEqual(['s1'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('静态失败但 API 成功 → 纯 API（warn）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = stub({ listGames: async () => [summary('a1')] })
    const stat = stub({ listGames: async () => { throw new Error('static down') } })
    const games = await new MergeContentRepository(api, stat).listGames()
    expect(games.map((g) => g.id)).toEqual(['a1'])
    warn.mockRestore()
  })

  test('双失败 → 抛 API 侧错误', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = stub({ listGames: async () => { throw new Error('api down') } })
    const stat = stub({ listGames: async () => { throw new Error('static down') } })
    await expect(new MergeContentRepository(api, stat).listGames()).rejects.toThrow('api down')
    vi.mocked(console.warn).mockRestore()
  })
})

describe('MergeContentRepository.getGame', () => {
  test('API 命中 → source api', async () => {
    const api = stub({ getGame: async () => game('g') })
    const g = await new MergeContentRepository(api, stub({})).getGame('g')
    expect(g.source).toBe('api')
  })
  test('API 404 → 回落静态，source static', async () => {
    const api = stub({ getGame: async () => { throw new NotFoundError('g') } })
    const stat = stub({ getGame: async () => game('g') })
    const g = await new MergeContentRepository(api, stat).getGame('g')
    expect(g.source).toBe('static')
  })
  test('API 5xx/网络错 → 直接上抛（不伪装 NotFound）', async () => {
    const api = stub({ getGame: async () => { throw new Error('请求失败 503') } })
    const stat = stub({ getGame: async () => game('g') })
    await expect(new MergeContentRepository(api, stat).getGame('g')).rejects.toThrow(/503/)
  })
  test('双侧 404 → NotFoundError', async () => {
    const merge = new MergeContentRepository(stub({}), stub({}))
    await expect(merge.getGame('nope')).rejects.toThrow(NotFoundError)
  })
})
