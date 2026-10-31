import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// F1（P16）bootstrap 兜底计时器源码级守卫（node 环境，与 themeBootstrap.test.ts /
// tableOverflow.test.ts 同族）：main.ts 的 45s settle 兜底计时器必须收敛进
// renewSettleTimer() 单点、并在每条 runtime:progress 安装进度上续期。否则弱网
// 大包下载超 45s 会假报「准备超时」→ 宿主降级面板 → SW 装完后 runtime:ready
// 又把页面抢回（fail↔ready 反复横跳）。main.ts 依赖 DOM，node 环境无法 import，
// 故沿 P13 范式读源码文本钉桩；进度分支断言为分区内匹配（先定位分支区段，再在
// 区段内找调用），不做全文裸 indexOf——注释提及不算数（见下方遮蔽腿）。

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const mainSrc = readFileSync(join(SRC_ROOT, 'bootstrap/main.ts'), 'utf8')

function blank(block: string): string {
  return block.replace(/[^\n]/g, ' ')
}

// 匹配前把注释整块置空（等长空格保留行号，P15-B maskSourceComments 同款手法）：
// 注释里的兜底字样会被 naive 匹配视为断言满足文本，造成假绿，必须中和。
// 已知局限（沿 ROADMAP 挂账表同类条款，如实记录）：① 字符串字面量含 `/*` 会让
// 块注释分支过度遮蔽（main.ts 实测无此形态，落地前已 grep 验证）；② 行中 `://`
// 是协议 URL 不是注释起点（`//` 前为 `:` 时跳过），main.ts 的 games.example.com
// 兜底串依赖此规则存活。
function maskSourceComments(src: string): string {
  const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, blank)
  return withoutBlocks
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '/' && line[i + 1] === '/' && line[i - 1] !== ':') {
          return line.slice(0, i) + blank(line.slice(i))
        }
      }
      return line
    })
    .join('\n')
}

const masked = maskSourceComments(mainSrc)

const PROGRESS_MARK = "message.type === 'runtime:progress'"
const READY_MARK = "message.type === 'runtime:ready'"
const ERROR_MARK = "message.type === 'runtime:error'"
const RENEW_HEADER = 'function renewSettleTimer(): void {'
const DECL_MARK = 'BOOTSTRAP_TIMEOUT_MS'
const TIMEOUT_FAIL = "fail('准备超时')"
const READY_FAIL = "fail('运行环境准备失败'"
const CLEAR_LITERAL = 'if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }'

/** 从标记起截到下一个零缩进 `}`（本仓函数声明为零缩进风格；main.ts 字符串内花括号恒成对）。 */
function zeroIndentBody(fromIdx: number, label: string): string {
  const tail = masked.slice(fromIdx)
  const close = tail.search(/^}/m)
  expect(close, `${label} 函数体应有零缩进收尾 }（遮蔽保行号）`).toBeGreaterThan(-1)
  return tail.slice(0, close)
}

describe('bootstrap 兜底计时器守卫（F1 / P16）', () => {
  it('runtime:progress 分支调用 renewSettleTimer 续期兜底（弱网大包不再假超时），进度条语义原位保留', () => {
    const start = masked.indexOf(PROGRESS_MARK)
    expect(start, 'main.ts 的 handle() 应有 runtime:progress 分支').toBeGreaterThan(-1)
    const end = masked.indexOf(READY_MARK, start)
    expect(end, 'progress 分支应后接 ready 分支（分支序被重排时守卫先红）').toBeGreaterThan(start)
    const branch = masked.slice(start, end)
    expect(branch, 'progress 分支应调用 renewSettleTimer() 续期兜底').toContain('renewSettleTimer()')
    expect(branch, '进度条更新语义必须在加续期时原位保留').toContain('progress.value')
  })

  it('renewSettleTimer 为顶层函数声明，模块顶层存在且仅存在一条初始臂（初始兜底在位，双臂即红）', () => {
    expect(masked.indexOf(RENEW_HEADER), 'renewSettleTimer 应为顶层函数声明').toBeGreaterThan(-1)
    expect(
      [...masked.matchAll(/^renewSettleTimer\(\);?[ \t]*$/gm)].length,
      '零缩进 renewSettleTimer() 调用应恰好一条（顶层初始臂；分支内调用有缩进、不计）'
    ).toBe(1)
  })

  it('BOOTSTRAP_TIMEOUT_MS 与 setTimeout( 只能在 renewSettleTimer 体内引用（防第二只漂移计时器）', () => {
    const decl = masked.indexOf(DECL_MARK)
    expect(decl, 'BOOTSTRAP_TIMEOUT_MS 的声明应存在').toBeGreaterThan(-1)
    const header = masked.indexOf(RENEW_HEADER)
    expect(header, 'renewSettleTimer 应存在').toBeGreaterThan(-1)
    const body = zeroIndentBody(header, 'renewSettleTimer')
    expect(body, 'renewSettleTimer 体内应以 BOOTSTRAP_TIMEOUT_MS 重设兜底').toContain('BOOTSTRAP_TIMEOUT_MS')
    expect(body, 'renewSettleTimer 体内应 setTimeout 设兜底').toContain('setTimeout(')
    expect(body, '兜底超时文案与 fail 调用必须逐字保留').toContain(TIMEOUT_FAIL)

    const refs = [...masked.matchAll(/BOOTSTRAP_TIMEOUT_MS/g)].map((m) => m.index ?? 0)
    expect(refs.length, 'BOOTSTRAP_TIMEOUT_MS 总出现次数 = 声明 + renew 体内一次（引用不得逃逸出 renew）').toBe(2)
    expect(
      [...masked.matchAll(/\bsetTimeout\(/g)].length,
      '全文 setTimeout( 恰好一次（且已在上方断言落在 renew 体内）——再无裸计时臂'
    ).toBe(1)
    const escaped = refs.filter((at) => at !== decl)
    expect(escaped.length, '声明之外的 BOOTSTRAP_TIMEOUT_MS 引用应恰好一处').toBe(1)
    expect(
      escaped[0] !== undefined && escaped[0] >= header && escaped[0] <= header + body.length,
      '声明之外的那处引用必须落在 renewSettleTimer 函数体内'
    ).toBe(true)
  })

  it('ready / degrade / priorVersion 清除语义逐字在位（续期提交不得削弱收尾清除）', () => {
    expect(
      masked.split(CLEAR_LITERAL).length - 1,
      '「先清兜底再收尾」三处应逐字在位（重复名字算双债，改动即红）'
    ).toBe(3)

    // signalDegrade（降级路径）：函数体第一件事就是清兜底
    const degradeAt = masked.indexOf('function signalDegrade(')
    expect(degradeAt, 'signalDegrade 声明应存在').toBeGreaterThan(-1)
    expect(
      zeroIndentBody(degradeAt, 'signalDegrade'),
      'signalDegrade 应先清兜底再转报降级'
    ).toContain(CLEAR_LITERAL)

    // runtime:ready：清兜底发生在「启动中…」流内（location.replace 前）
    const readyAt = masked.indexOf(READY_MARK)
    expect(readyAt, 'ready 分支应存在').toBeGreaterThan(-1)
    const errorAt = masked.indexOf(ERROR_MARK, readyAt)
    expect(errorAt, 'ready 分支应后接 error 分支').toBeGreaterThan(readyAt)
    expect(masked.slice(readyAt, errorAt), 'runtime:ready 应先清兜底').toContain(CLEAR_LITERAL)

    // runtime:error(priorVersion)：恢复旧版本前清兜底
    const priorAt = masked.indexOf('message.priorVersion', errorAt)
    expect(priorAt, 'priorVersion 分支应存在').toBeGreaterThan(-1)
    const failAt = masked.indexOf(READY_FAIL, errorAt)
    expect(failAt, 'priorVersion 分支应后接 fail 兜底调用').toBeGreaterThan(priorAt)
    expect(masked.slice(priorAt, failAt), 'priorVersion 恢复旧版本前应清兜底').toContain(CLEAR_LITERAL)
  })

  it('遮蔽有效性自证（P15-B 终审 finding 同源）：注释命中被中和、字符串与行号存活', () => {
    const sample = [
      'const a = 1 // renewTrap 注释',
      '/* renewTrap */ const b = 2',
      "const u = 'https://x.example' // renewComment",
      'const code = 3'
    ].join('\n')
    const m = maskSourceComments(sample)
    expect(m, '注释里的字样必须被中和').not.toContain('renewTrap')
    expect(m, '行注释放得过、真代码保留').toContain('const a = 1')
    expect(m, '块注释只吃注释、同行代码保留').toContain('const b = 2')
    expect(m, '字符串里的 :// 不是注释起点（协议 URL 存活）').toContain("'https://x.example'")
    expect(m.split('\n').length, '行数不变（等长空格保行号）').toBe(sample.split('\n').length)
  })
})
