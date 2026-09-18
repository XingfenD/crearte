#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = path.join(root, 'dist')
const shared = {
  configFile: false,
  root,
  logLevel: 'warn',
  build: { target: 'es2020', emptyOutDir: false, outDir: 'dist', write: true }
}

const ESM_RE = /\b(?:import|export)\b/
const ASSET_RE = /\/assets\//

function assertNoEsm(source, label) {
  if (ESM_RE.test(source)) throw new Error(`[build-runtime] ${label} 仍含 import/export，未打成 IIFE`)
  if (ASSET_RE.test(source)) throw new Error(`[build-runtime] ${label} 仍引用 /assets/`)
}

await build({
  ...shared,
  build: {
    ...shared.build,
    lib: { entry: path.join(root, 'runtime/sw/index.ts'), formats: ['iife'], name: 'RuntimeSW', fileName: () => 'sw.js' }
  }
})
await build({
  ...shared,
  build: {
    ...shared.build,
    lib: { entry: path.join(root, 'runtime/agent/index.ts'), formats: ['iife'], name: 'RuntimeAgent', fileName: () => 'agent.js' }
  }
})

assertNoEsm(await readFile(path.join(dist, 'sw.js'), 'utf8'), 'dist/sw.js')
assertNoEsm(await readFile(path.join(dist, 'agent.js'), 'utf8'), 'dist/agent.js')

const bootstrapHtmlPath = path.join(dist, 'bootstrap/index.html')
if (!existsSync(bootstrapHtmlPath)) {
  await build({
    ...shared,
    build: {
      ...shared.build,
      rollupOptions: { input: { bootstrap: path.join(root, 'bootstrap/index.html') } }
    }
  })
}

const shellPath = path.join(dist, 'bootstrap-shell.js')
await build({
  ...shared,
  build: {
    ...shared.build,
    lib: { entry: path.join(root, 'bootstrap/main.ts'), formats: ['iife'], name: 'BootstrapShell', fileName: () => 'bootstrap-shell.js' }
  }
})

const shellSource = await readFile(shellPath, 'utf8')
assertNoEsm(shellSource, 'dist/bootstrap-shell.js')

// 标记用于让重复执行 build:runtime 时先移除上一次内联的 shell（保持幂等）
const SHELL_START = '<!-- bootstrap-shell:start -->'
const SHELL_END = '<!-- bootstrap-shell:end -->'

const html = await readFile(bootstrapHtmlPath, 'utf8')
let cleaned = html
  .replace(/[ \t]*<script\b[^>]*\bsrc="\/assets\/[^"]*"[^>]*><\/script>\r?\n?/g, '')
  .replace(/[ \t]*<link\b[^>]*\brel="modulepreload"[^>]*>\r?\n?/g, '')
for (let start = cleaned.indexOf(SHELL_START); start >= 0; start = cleaned.indexOf(SHELL_START)) {
  const end = cleaned.indexOf(SHELL_END, start)
  if (end < 0) throw new Error('[build-runtime] dist/bootstrap/index.html 内联标记不成对')
  cleaned = cleaned.slice(0, start) + cleaned.slice(end + SHELL_END.length)
}
const bodyClose = /<\/body>/i.exec(cleaned)
if (!bodyClose) throw new Error('[build-runtime] dist/bootstrap/index.html 缺少 </body>')
const output = `${cleaned.slice(0, bodyClose.index)}    ${SHELL_START}\n    <script>${shellSource}</script>\n    ${SHELL_END}\n  ${cleaned.slice(bodyClose.index)}`
if (ASSET_RE.test(output)) throw new Error('[build-runtime] dist/bootstrap/index.html 仍引用 /assets/')
await writeFile(bootstrapHtmlPath, output)
await rm(shellPath)

console.log('[build-runtime] dist/sw.js, dist/agent.js, dist/bootstrap/index.html (self-contained)')
