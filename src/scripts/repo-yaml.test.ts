import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT } from './build-data.mjs'

const REPO_ROOT = path.resolve(SRC_ROOT, '..')

async function loadYaml(relative: string): Promise<Record<string, any>> {
  return parse(await readFile(path.join(REPO_ROOT, relative), 'utf8'))
}

describe('GitHub workflows', () => {
  it('validate.yml 在 PR 上跑数据校验与完整检查', async () => {
    const workflow = await loadYaml('.github/workflows/validate.yml')
    expect(Object.keys(workflow.on).map(String)).toContain('pull_request')
    const body = JSON.stringify(workflow)
    expect(body).toContain('npm ci')
    expect(body).toContain('validate:data')
    expect(body).toContain('npm run check')
  })

  it('publish.yml 推到 GHCR 并调用 keel webhook', async () => {
    const workflow = await loadYaml('.github/workflows/publish.yml')
    const steps = workflow.jobs.publish.steps as Array<Record<string, unknown>>
    expect(steps.some((step) => String(step.uses ?? '').startsWith('docker/build-push-action'))).toBe(true)
    expect(steps.some((step) => String(step.uses ?? '').startsWith('docker/login-action'))).toBe(true)
    const body = JSON.stringify(workflow)
    expect(body).toContain('ghcr.io')
    expect(body).toContain('keel:${KEEL_TOKEN}')
    expect(body).toContain('KEEL_WEBHOOK_URL')
    expect(body).toContain('deploy/Dockerfile')
  })
})
