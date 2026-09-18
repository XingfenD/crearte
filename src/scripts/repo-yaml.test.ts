import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT } from './build-data.mjs'

const REPO_ROOT = path.resolve(SRC_ROOT, '..')

async function loadYaml(relative: string): Promise<Record<string, any>> {
  return parse(await readFile(path.join(REPO_ROOT, relative), 'utf8'))
}

function serverBlock(nginx: string, serverName: string): string {
  const block = nginx
    .split(/^server \{/m)
    .slice(1)
    .find((candidate) => candidate.includes(`server_name ${serverName};`))
  if (!block) throw new Error(`nginx.conf 缺少 server_name ${serverName} 的 server block`)
  return block
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

describe('k8s manifests', () => {
  const files = ['namespace.yaml', 'deployment.yaml', 'service.yaml']

  it('全部可解析且命名空间一致', async () => {
    for (const file of files) {
      const doc = await loadYaml(`deploy/k8s/${file}`)
      expect(doc, `${file} 无法解析`).toBeTruthy()
      if (doc.metadata?.namespace) expect(doc.metadata.namespace).toBe('webgame-collection')
      else expect(doc.metadata?.name).toBe('webgame-collection')
    }
  })

  it('deployment 带 keel 注解、镜像指向 ghcr、带探针与资源限制', async () => {
    const deployment = await loadYaml('deploy/k8s/deployment.yaml')
    const annotations = deployment.metadata.annotations
    expect(annotations['keel.sh/policy']).toBe('force')
    expect(annotations['keel.sh/match-tag']).toBe('true')
    expect(annotations['keel.sh/trigger']).toBe('poll')
    const container = deployment.spec.template.spec.containers[0]
    expect(container.image).toContain('ghcr.io/')
    expect(container.image.endsWith(':latest')).toBe(true)
    expect(container.readinessProbe.httpGet.path).toBe('/')
    expect(container.resources.requests).toBeTruthy()
    expect(container.resources.limits).toBeTruthy()
  })

  it('service 以 NodePort 暴露应用端口 80', async () => {
    const service = await loadYaml('deploy/k8s/service.yaml')
    expect(service.spec.type).toBe('NodePort')
    expect(service.spec.ports[0].port).toBe(80)
    expect(service.spec.ports[0].nodePort).toBe(30080)
    expect(service.spec.selector.app).toBe('webgame-collection')
  })
})

describe('deploy/nginx.conf', () => {
  async function loadNginx(): Promise<string> {
    return readFile(path.join(REPO_ROOT, 'deploy', 'nginx.conf'), 'utf8')
  }

  it('通配游戏域 server block 只暴露运行时三件套与 404 兜底', async () => {
    const wildcard = serverBlock(await loadNginx(), '*.games.example.com')
    expect(wildcard).toMatch(/listen\s+80;/)
    expect(wildcard).toMatch(/root\s+\/usr\/share\/nginx\/html;/)

    const exact = [...wildcard.matchAll(/location\s*=\s*(\S+)\s*\{([^}]*)\}/g)]
    expect(exact.map(([, location]) => location).sort()).toEqual(['/__bootstrap', '/agent.js', '/sw.js'])
    for (const [, location, body] of exact) {
      expect(body, `${location} 需要 no-store`).toContain('"no-store"')
    }

    expect(wildcard).toMatch(/location\s*\/\s*\{[\s\S]*?return 404;\s*\}/)
    expect(wildcard).not.toMatch(/location\s+\/data\//)
    expect(wildcard).not.toMatch(/location\s+\/assets\//)
  })

  it('主站为 /data/bundles/ 提供 CORS 且保留 /data/ 行为', async () => {
    const main = serverBlock(await loadNginx(), '_')
    const bundles = main.match(/location\s+\/data\/bundles\/\s*\{([^}]*)\}/)
    expect(bundles, '主站缺少 /data/bundles/ location').toBeTruthy()
    expect(bundles?.[1]).toContain('Access-Control-Allow-Origin')
    expect(bundles?.[1]).toMatch(/try_files\s+\$uri\s+=404;/)
    expect(main).toMatch(/location\s+\/data\/\s*\{/)
  })
})
