# 前端账号系统接入（注册 / 登录）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在前端站点接入后端无状态 JWT 账号系统：注册 / 登录 / 当前用户 / 改密 / 登出全部五条链路 + 本地凭证管理与三态 header，形成完整账号闭环。

**架构：** 新增独立 `src/app/auth/` 模块（`types` / `errors` / `storage` / `validation` / `client` / `session` / `index` 单例），与既有 `ContentRepository` 解耦；凭证走 `localStorage` + `Authorization: Bearer`，启动时"缓存乐观渲染 + `GET /me` 复核"；界面为 `/login`、`/register`、`/account` 三个路由页；后端补一处 `CORS_ALLOWED_ORIGINS` 精确白名单。

**技术栈：** Vue 3.5 + TypeScript 6（strict）+ Vite 8 + Vue Router 5 + Tailwind v4 + Vitest 5 + Playwright 1.63；无新增运行期依赖。

**规格：** `docs/superpowers/specs/2026-09-19-frontend-auth-integration-design.md`

## Global Constraints

- 环境：Node v24 / npm 11（`/root/.nvm/versions/node/v24.18.0/bin`）；`src/` 下先 `npm install`（仓库未提交 `node_modules`）
- 所有命令在 `crearte/src/` 下运行（`git` 命令在仓库根 `crearte/`）；**禁止在 `master` 提交**，本计划全程在分支 `feat/auth-integration`
- 视觉令牌只用现有平面海报体系（`.lift`、`.btn-ink`、`border-ink`、`bg-surface`、`shadow-hard`、`font-mono`）；零渐变、全直角
- 契约细节以规格 §6 为准：`Authorization: Bearer <jwt>`，不用 cookie；错误体 `{error:{code,message}}`；401 → `unauthorized` 才清会话（`invalid_credentials` 是登录失败，**不能**清热会话）；429 读 `Retry-After`
- `ContentRepository`（`src/app/data/**`）在本计划中**一行不改**
- 每个任务结束运行 `npx vitest run`（或该任务指定的子集）+ `npm run typecheck`，必须全绿；提交信息用各任务给出的原文
- CHANGELOG 格式：同一条英文行后紧跟中文行，不同条目空行分隔（`docs/CHANGELOG.md`，高版本在上）
- 后端配套改动（任务 1）在 `crearte-server` 仓库的分支 `feat/auth-jwt` 上做，验收命令：`cd src && gofmt -l . && go vet ./... && go build ./... && go test ./...`（需 `PATH=/usr/local/go/bin:$PATH`、`GOPROXY=https://goproxy.cn,direct`）

## File Structure

新建（前端 `crearte`）：

| 文件 | 职责 |
|---|---|
| `src/app/auth/types.ts` | `AuthUser` / `Session` / `AuthResponse` / `UserRole` |
| `src/app/auth/errors.ts` | `AuthErrorCode`、文案表、`AuthApiError`、`toUserMessage()` |
| `src/app/auth/storage.ts` | `SESSION_STORAGE_KEY`、`parseSession()`、`createSessionStore()`（注入 storage + now） |
| `src/app/auth/validation.ts` | `normalizeEmail` / `validateEmail` / `validatePassword` / `validateDisplayName` / `sanitizeNext` |
| `src/app/auth/client.ts` | `createAuthClient()`：五个端点的 HTTP 封装、错误映射、401 钩子 |
| `src/app/auth/session.ts` | `createAuthSession()`：状态、登录/注册/改密/登出/登出全部、`restore()`、`invalidate()` |
| `src/app/auth/index.ts` | 单例装配（读 `VITE_API_BASE_URL`，把 client 的 401 钩子接到 session） |
| `src/app/views/LoginView.vue` | 登录页 |
| `src/app/views/RegisterView.vue` | 注册页 |
| `src/app/views/AccountView.vue` | 账号页（身份、改密、登出全部、登出） |
| `src/e2e/auth.spec.ts` | 账号链路 e2e（`page.route` 拦 API） |
| `src/.env.development` | dev 用 `VITE_API_BASE_URL=http://localhost:8080` |

修改：

| 文件 | 改动 |
|---|---|
| `src/app/router/index.ts` | 三个路由 + `requiresAuth` 守卫 |
| `src/app/components/AppHeader.vue` | header 右侧三态入口 |
| `src/package.json` | `build:e2e` 注入 `VITE_API_BASE_URL` |
| `docs/README.md` | 环境变量表 + 本地联调步骤 |
| `docs/CHANGELOG.md` | 0.3.0 条目 |

后端（`crearte-server`）：`src/internal/config/config.go`、`src/internal/api/cors.go`、`src/internal/api/router.go`、`src/cmd/serve.go` + 对应 `_test.go`。

---

### 任务 1：后端 CORS 允许源白名单（`crearte-server`）

**文件：**
- 修改：`crearte-server/src/internal/config/config.go`
- 修改：`crearte-server/src/internal/config/config_test.go`
- 修改：`crearte-server/src/internal/api/cors.go`
- 修改：`crearte-server/src/internal/api/cors_test.go`
- 修改：`crearte-server/src/internal/api/router.go`
- 修改：`crearte-server/src/internal/api/router_test.go`
- 修改：`crearte-server/src/cmd/serve.go`

- [ ] **步骤 1：写失败的 config 测试**

在 `crearte-server/src/internal/config/config_test.go` 的 `TestLoadValid` 中，`t.Setenv("TRUSTED_PROXIES", ...)` 之后加一行：

```go
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://crearte.yoresee.cc, https://www.crearte.yoresee.cc")
```

并在该测试的 `TrustedProxies` 断言之后加：

```go
	if len(cfg.CORSAllowedOrigins) != 2 || cfg.CORSAllowedOrigins[0] != "https://crearte.yoresee.cc" || cfg.CORSAllowedOrigins[1] != "https://www.crearte.yoresee.cc" {
		t.Errorf("CORSAllowedOrigins = %v", cfg.CORSAllowedOrigins)
	}
```

在 `TestLoadDefaults` 的 `t.Setenv("TRUSTED_PROXIES", "")` 之后加：

```go
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
```

并在其断言末尾加：

```go
	if len(cfg.CORSAllowedOrigins) != 0 {
		t.Errorf("CORSAllowedOrigins = %v, want empty", cfg.CORSAllowedOrigins)
	}
```

在 `TestLoadRejectsBadDatabaseAndAuth` 末尾加（`validEnv(t)` **不重置 `TRUSTED_PROXIES`**，而 `applyBase` 先解析 proxies 再解析 origins——不显式清空 `TRUSTED_PROXIES` 会让该函数在前面 `not-an-ip` 处先行失败返回，此断言即空转：

```go
	validEnv(t)
	t.Setenv("TRUSTED_PROXIES", "")
	t.Setenv("CORS_ALLOWED_ORIGINS", "not-a-url")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for invalid CORS_ALLOWED_ORIGINS")
	} else if !strings.Contains(err.Error(), "CORS_ALLOWED_ORIGINS") {
		t.Fatalf("error = %v, want CORS_ALLOWED_ORIGINS mention", err)
	}
```

- [ ] **步骤 1a：补 import**

`config_test.go` 现有 import 为 `encoding/base64`、`testing`、`time`，本任务起需要 import 增加 `strings`。

- [ ] **步骤 2：运行测试确认失败**

运行：`cd crearte-server/src && /usr/local/go/bin/go test ./internal/config/`
预期：FAIL，编译报错 `cfg.CORSAllowedOrigins undefined`

- [ ] **步骤 3：实现 config 解析**

`config.go` 的 `Config` 结构体在 `TrustedProxies []string` 之后加字段：

```go
	CORSAllowedOrigins []string
```

`applyBase` 中 `cfg.TrustedProxies = proxies` 之后加：

```go
	origins, err := parseAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if err != nil {
		return err
	}
	cfg.CORSAllowedOrigins = origins
```

并新增函数（放在 `parseTrustedProxies` 之后）：

```go
func parseAllowedOrigins(raw string) ([]string, error) {
	origins := []string{}
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		u, err := url.Parse(item)
		if err != nil || u.Scheme == "" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return nil, fmt.Errorf("config: CORS_ALLOWED_ORIGINS: invalid origin %q", item)
		}
		origins = append(origins, u.Scheme+"://"+u.Host)
	}
	return origins, nil
}
```

`config.go` 的 import 块增加 `"net/url"`。

- [ ] **步骤 4：运行 config 测试确认通过**

运行：`cd crearte-server/src && /usr/local/go/bin/go test ./internal/config/`
预期：PASS

- [ ] **步骤 5：写失败的 CORS 测试**

在 `crearte-server/src/internal/api/cors_test.go` 末尾追加：

```go
func TestCORSAllowsExplicitOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(NewCORS("crearte-games.yoresee.cc", []string{"https://crearte.yoresee.cc"}).Middleware())
	engine.GET("/api/auth/me", func(ctx *gin.Context) { ctx.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Origin", "https://crearte.yoresee.cc")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://crearte.yoresee.cc" {
		t.Fatalf("Allow-Origin = %q", got)
	}

	preflight := httptest.NewRequest(http.MethodOptions, "/api/auth/me", nil)
	preflight.Header.Set("Origin", "https://crearte.yoresee.cc")
	preflight.Header.Set("Access-Control-Request-Method", "POST")
	rec = httptest.NewRecorder()
	engine.ServeHTTP(rec, preflight)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", rec.Code)
	}

	sibling := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	sibling.Header.Set("Origin", "https://crearte-games.yoresee.cc")
	rec = httptest.NewRecorder()
	engine.ServeHTTP(rec, sibling)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://crearte-games.yoresee.cc" {
		t.Fatalf("games subdomain Allow-Origin = %q", got)
	}

	evil := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	evil.Header.Set("Origin", "https://evil.yoresee.cc")
	rec = httptest.NewRecorder()
	engine.ServeHTTP(rec, evil)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unlisted origin must not receive CORS headers")
	}
}
```

同时把已有两个测试里的 `NewCORS("games.example.com")` / `NewCORS("localhost")` 调用补上第二个参数 `nil`。

- [ ] **步骤 6：运行测试确认失败**

运行：`cd crearte-server/src && /usr/local/go/bin/go test ./internal/api/`
预期：FAIL，编译报错 `too many arguments in call to NewCORS`

- [ ] **步骤 7：实现 allowed origins**

`cors.go` 改为：

```go
type CORS struct {
	baseDomain     string
	allowedOrigins map[string]struct{}
}

func NewCORS(baseDomain string, allowedOrigins []string) *CORS {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[origin] = struct{}{}
	}
	return &CORS{baseDomain: baseDomain, allowedOrigins: allowed}
}
```

`allowed()` 方法开头插入精确匹配：

```go
	if _, ok := c.allowedOrigins[origin]; ok {
		return true
	}
```

- [ ] **步骤 8：更新 router 与 serve 装配**

`router.go` 的 `Deps` 增加字段 `CORSAllowedOrigins []string`，并把 CORS 中间件调用改为：

```go
	engine.Use(NewCORS(deps.GamesBaseDomain, deps.CORSAllowedOrigins).Middleware())
```

`serve.go` 的 `api.Deps{...}` 增加一行：

```go
				CORSAllowedOrigins: cfg.CORSAllowedOrigins,
```

`router_test.go` 的 `TestBundleKeyRoute` 里 `NewRouter(Deps{BundleKey: ..., GamesBaseDomain: "localhost"})` 保持不变（`CORSAllowedOrigins` 为零值，合法）。

- [ ] **步骤 9：全量验收**

运行：

```bash
cd crearte-server/src && export PATH=/usr/local/go/bin:$PATH GOPROXY=https://goproxy.cn,direct
gofmt -l . && go vet ./... && go build ./... && go test ./...
```

预期：全绿，`gofmt -l .` 无输出。（设了 `TEST_DATABASE_URL` 时集成测试用 `-p 1` 串行跑。）

手工冒烟（可选）：起服务后带 `Origin: https://crearte.yoresee.cc` 预检 `POST /api/auth/login`，应回 `204` 且 `Access-Control-Allow-Origin` 为该域。

- [ ] **步骤 10：提交（在 `crearte-server`，分支 `feat/auth-jwt`）**

```bash
cd crearte-server && git branch --show-current   # 必须为 feat/auth-jwt
git add src
git commit -m "feat: add cors allowed origins"
```

---

### 任务 2：auth 类型与错误映射

**文件：**
- 创建：`src/app/auth/types.ts`
- 创建：`src/app/auth/errors.ts`
- 测试：`src/app/auth/errors.test.ts`

- [ ] **步骤 1：写失败的测试**

```ts
import { describe, expect, it } from 'vitest'
import { AUTH_ERROR_MESSAGES, AuthApiError, toUserMessage } from './errors'

describe('auth 错误映射', () => {
  it('已知 code 走文案表', () => {
    expect(toUserMessage(new AuthApiError(400, 'invalid_email', 'x'))).toBe(AUTH_ERROR_MESSAGES.invalid_email)
    expect(toUserMessage(new AuthApiError(401, 'invalid_credentials', 'x'))).toBe('邮箱或密码不正确')
  })

  it('rate_limited 带 Retry-After 时给出秒数', () => {
    expect(toUserMessage(new AuthApiError(429, 'rate_limited', 'x', 42))).toBe('操作太频繁，请 42 秒后重试')
    expect(toUserMessage(new AuthApiError(429, 'rate_limited', 'x'))).toBe(AUTH_ERROR_MESSAGES.rate_limited)
  })

  it('未知错误按网络失败兜底', () => {
    expect(toUserMessage(new Error('boom'))).toBe(AUTH_ERROR_MESSAGES.network)
    expect(toUserMessage('boom')).toBe(AUTH_ERROR_MESSAGES.network)
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd src && npx vitest run app/auth/errors.test.ts`
预期：FAIL，`Failed to resolve import "./errors"`

- [ ] **步骤 3：实现**

`src/app/auth/types.ts`：

```ts
export type UserRole = 'user' | 'admin'

export interface AuthUser {
  id: string
  email: string
  display_name: string
  role: UserRole
}

export interface Session {
  token: string
  expiresAt: string
  user: AuthUser
}

export interface AuthResponse {
  token: string
  expires_at: string
  user: AuthUser
}
```

`src/app/auth/errors.ts`：

```ts
export type AuthErrorCode =
  | 'invalid_request'
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_display_name'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unauthorized'
  | 'rate_limited'
  | 'internal'
  | 'network'

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_request: '请求格式不正确，请重试',
  invalid_email: '邮箱格式不正确',
  weak_password: '密码需 10–128 个字符',
  invalid_display_name: '昵称需 1–60 个字符，且不能含控制字符',
  email_taken: '该邮箱已注册，可直接登录',
  invalid_credentials: '邮箱或密码不正确',
  unauthorized: '登录已过期，请重新登录',
  rate_limited: '操作太频繁，请稍后重试',
  internal: '服务暂时不可用，请稍后重试',
  network: '网络连接失败，请检查网络后重试'
}

export class AuthApiError extends Error {
  readonly status: number
  readonly code: AuthErrorCode
  readonly retryAfterSeconds: number | null

  constructor(status: number, code: AuthErrorCode, message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const KNOWN_CODES = new Set<string>(Object.keys(AUTH_ERROR_MESSAGES))

export function toErrorCode(value: unknown, fallback: AuthErrorCode = 'internal'): AuthErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value) ? (value as AuthErrorCode) : fallback
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    if (error.code === 'rate_limited' && error.retryAfterSeconds) {
      return `操作太频繁，请 ${error.retryAfterSeconds} 秒后重试`
    }
    return AUTH_ERROR_MESSAGES[error.code]
  }
  return AUTH_ERROR_MESSAGES.network
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`cd src && npx vitest run app/auth/errors.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd crearte && git branch --show-current   # 必须为 feat/auth-integration
git add src/app/auth
git commit -m "feat: add auth types and error mapping"
```

---

### 任务 3：本地凭证存储

**文件：**
- 创建：`src/app/auth/storage.ts`
- 测试：`src/app/auth/storage.test.ts`

- [ ] **步骤 1：写失败的测试**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_STORAGE_KEY, createSessionStore, parseSession } from './storage'
import type { Session } from './types'

const NOW = Date.parse('2026-09-19T12:00:00Z')
const session: Session = {
  token: 'token-1',
  expiresAt: '2026-09-26T12:00:00Z',
  user: { id: 'u1', email: 'a@example.com', display_name: 'Tester', role: 'user' }
}

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  keys() { return [...this.data.keys()] }
}

let storage: MemoryStorage

beforeEach(() => { storage = new MemoryStorage() })

describe('auth 凭证存储', () => {
  it('写入后可读回', () => {
    createSessionStore(storage, () => NOW).write(session)
    expect(storage.getItem(SESSION_STORAGE_KEY)).toContain('token-1')
    expect(createSessionStore(storage, () => NOW).read()).toEqual(session)
  })

  it('过期即清除并返回 null', () => {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, expiresAt: '2026-09-19T11:59:59Z' }))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('损坏 JSON 与字段缺失都清除并返回 null', () => {
    storage.setItem(SESSION_STORAGE_KEY, '{oops')
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: 't', expiresAt: session.expiresAt }))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, user: { ...session.user, role: 'root' } }))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
  })

  it('clear 清空', () => {
    const store = createSessionStore(storage, () => NOW)
    store.write(session)
    store.clear()
    expect(store.read()).toBeNull()
    expect(storage.keys()).toHaveLength(0)
  })

  it('别的版本 key 不会被读取', () => {
    storage.setItem('crearte.auth.session.v0', JSON.stringify(session))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
    expect(storage.getItem('crearte.auth.session.v0')).not.toBeNull()
  })

  it('parseSession 对时间非法串返回 null', () => {
    expect(parseSession(JSON.stringify({ ...session, expiresAt: 'soon' }), NOW)).toBeNull()
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd src && npx vitest run app/auth/storage.test.ts`
预期：FAIL，`Failed to resolve import "./storage"`

- [ ] **步骤 3：实现**

```ts
import type { AuthUser, Session } from './types'

export const SESSION_STORAGE_KEY = 'crearte.auth.session.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SessionStore {
  read(): Session | null
  write(session: Session): void
  clear(): void
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const user = value as Record<string, unknown>
  return typeof user.id === 'string' && user.id !== ''
    && typeof user.email === 'string'
    && typeof user.display_name === 'string'
    && (user.role === 'user' || user.role === 'admin')
}

export function parseSession(raw: string | null, nowMs: number): Session | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const value = parsed as Record<string, unknown>
  if (typeof value.token !== 'string' || value.token === '') return null
  if (typeof value.expiresAt !== 'string') return null
  const expiresAtMs = Date.parse(value.expiresAt)
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs) return null
  if (!isAuthUser(value.user)) return null
  return { token: value.token, expiresAt: value.expiresAt, user: value.user }
}

export function createSessionStore(storage: StorageLike, now: () => number = Date.now): SessionStore {
  return {
    read() {
      const session = parseSession(storage.getItem(SESSION_STORAGE_KEY), now())
      if (!session) storage.removeItem(SESSION_STORAGE_KEY)
      return session
    },
    write(session: Session) {
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    },
    clear() {
      storage.removeItem(SESSION_STORAGE_KEY)
    }
  }
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`cd src && npx vitest run app/auth/storage.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd crearte && git add src/app/auth
git commit -m "feat: add auth session storage"
```

---

### 任务 4：表单校验与 `next` 净化

**文件：**
- 创建：`src/app/auth/validation.ts`
- 测试：`src/app/auth/validation.test.ts`

- [ ] **步骤 1：写失败的测试**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeEmail, sanitizeNext, validateDisplayName, validateEmail, validatePassword } from './validation'

describe('auth 表单校验', () => {
  it('邮箱 trim + 小写,并拒绝非法形态', () => {
    expect(normalizeEmail('  A@Example.COM ')).toBe('a@example.com')
    expect(validateEmail('  A@Example.COM ')).toBeNull()
    expect(validateEmail('nope')).toBe('invalid_email')
    expect(validateEmail('a@b')).toBe('invalid_email')
    expect(validateEmail('a b@example.com')).toBe('invalid_email')
    expect(validateEmail('')).toBe('invalid_email')
  })

  it('邮箱超过 254 字节被拒', () => {
    const long = `${'a'.repeat(250)}@example.com`
    expect(validateEmail(long)).toBe('invalid_email')
  })

  it('密码按字符数计,10-128 之间通过', () => {
    expect(validatePassword('a'.repeat(9))).toBe('weak_password')
    expect(validatePassword('a'.repeat(10))).toBeNull()
    expect(validatePassword('a'.repeat(128))).toBeNull()
    expect(validatePassword('a'.repeat(129))).toBe('weak_password')
    expect(validatePassword('密码密码密码密码密码')).toBeNull()
  })

  it('昵称 trim 后 1-60 字符且不含控制字符', () => {
    expect(validateDisplayName('  Tester  ')).toBeNull()
    expect(validateDisplayName('   ')).toBe('invalid_display_name')
    expect(validateDisplayName('a'.repeat(61))).toBe('invalid_display_name')
    expect(validateDisplayName(`a${String.fromCharCode(7)}b`)).toBe('invalid_display_name')
  })

  it('sanitizeNext 只放行站内相对路径', () => {
    expect(sanitizeNext('/account')).toBe('/account')
    expect(sanitizeNext('/games/2048?x=1#top')).toBe('/games/2048?x=1#top')
    expect(sanitizeNext('//evil.com')).toBe('/')
    expect(sanitizeNext('https://evil.com')).toBe('/')
    expect(sanitizeNext('/a\\b')).toBe('/')
    expect(sanitizeNext(undefined)).toBe('/')
    expect(sanitizeNext(['/a', '/b'])).toBe('/')
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd src && npx vitest run app/auth/validation.test.ts`
预期：FAIL，`Failed to resolve import "./validation"`

- [ ] **步骤 3：实现**

```ts
export const EMAIL_MAX_BYTES = 254
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128
export const DISPLAY_NAME_MAX = 60

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const CONTROL_PATTERN = /\p{Cc}/u

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validateEmail(value: string): 'invalid_email' | null {
  const email = normalizeEmail(value)
  if (email === '' || new TextEncoder().encode(email).length > EMAIL_MAX_BYTES) return 'invalid_email'
  return EMAIL_PATTERN.test(email) ? null : 'invalid_email'
}

export function validatePassword(value: string): 'weak_password' | null {
  const length = [...value].length
  return length >= PASSWORD_MIN && length <= PASSWORD_MAX ? null : 'weak_password'
}

export function validateDisplayName(value: string): 'invalid_display_name' | null {
  const name = value.trim()
  if (name === '' || [...name].length > DISPLAY_NAME_MAX) return 'invalid_display_name'
  return CONTROL_PATTERN.test(name) ? 'invalid_display_name' : null
}

export function sanitizeNext(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.includes('\\')) return '/'
  return value
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`cd src && npx vitest run app/auth/validation.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd crearte && git add src/app/auth
git commit -m "feat: add auth form validation"
```

---

### 任务 5：auth HTTP 客户端

**文件：**
- 创建：`src/app/auth/client.ts`
- 测试：`src/app/auth/client.test.ts`

- [ ] **步骤 1：写失败的测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthClient } from './client'

const BASE = 'https://api.crearte.yoresee.cc'

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

function client(onUnauthorized?: () => void) {
  return createAuthClient({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch, onUnauthorized })
}

beforeEach(() => { fetchMock = vi.fn() })

describe('auth 客户端', () => {
  it('login 打对地址并解析 AuthResponse', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      token: 't1',
      expires_at: '2026-09-26T12:00:00Z',
      user: { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' }
    }, 200))
    const result = await client().login({ email: 'a@example.com', password: 'password1234' })
    expect(result.token).toBe('t1')
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/auth/login`, expect.objectContaining({ method: 'POST' }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@example.com', password: 'password1234' })
  })

  it('register 用 display_name 字段名', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      token: 't1', expires_at: '2026-09-26T12:00:00Z',
      user: { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' }
    }, 201))
    await client().register({ email: 'a@example.com', password: 'password1234', displayName: 'A' })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@example.com', password: 'password1234', display_name: 'A' })
  })

  it('错误体映射为 AuthApiError 并带上 code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'email_taken', message: 'email already registered' } }, 409))
    await expect(client().register({ email: 'a@example.com', password: 'password1234', displayName: 'A' }))
      .rejects.toMatchObject({ status: 409, code: 'email_taken' })
  })

  it('未知 code 归一到 internal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'mystery', message: 'x' } }, 500))
    await expect(client().login({ email: 'a@example.com', password: 'password1234' }))
      .rejects.toMatchObject({ status: 500, code: 'internal' })
  })

  it('429 读出 Retry-After 秒数', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'Retry-After': '42' }))
    await expect(client().login({ email: 'a@example.com', password: 'password1234' }))
      .rejects.toMatchObject({ status: 429, code: 'rate_limited', retryAfterSeconds: 42 })
  })

  it('401 unauthorized 触发钩子,invalid_credentials 不触发', async () => {
    const onUnauthorized = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'unauthorized', message: 'x' } }, 401))
    await expect(client(onUnauthorized).me('token')).rejects.toMatchObject({ code: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_credentials', message: 'x' } }, 401))
    await expect(client(onUnauthorized).login({ email: 'a@example.com', password: 'password1234' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('Bearer 头只在带 token 的请求上', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' } }, 200))
    await client().me('token-9')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-9')
  })

  it('logoutAll 接受 204 空响应', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: new Headers() } as Response)
    await expect(client().logoutAll('token')).resolves.toBeUndefined()
  })

  it('网络异常归为 network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('failed to fetch'))
    await expect(client().login({ email: 'a@example.com', password: 'password1234' }))
      .rejects.toMatchObject({ status: 0, code: 'network' })
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd src && npx vitest run app/auth/client.test.ts`
预期：FAIL，`Failed to resolve import "./client"`

- [ ] **步骤 3：实现**

```ts
import { AuthApiError, toErrorCode, type AuthErrorCode } from './errors'
import type { AuthResponse, AuthUser } from './types'

export interface AuthClientOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  onUnauthorized?: () => void
}

export interface AuthClient {
  register(input: { email: string; password: string; displayName: string }): Promise<AuthResponse>
  login(input: { email: string; password: string }): Promise<AuthResponse>
  me(token: string): Promise<AuthUser>
  changePassword(token: string, input: { currentPassword: string; newPassword: string }): Promise<AuthResponse>
  logoutAll(token: string): Promise<void>
}

function parseRetryAfter(headers: Headers | undefined): number | null {
  const raw = headers?.get('Retry-After')
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function readErrorCode(response: Response): Promise<AuthErrorCode> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } }
    return toErrorCode(body?.error?.code)
  } catch {
    return 'internal'
  }
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const base = options.baseUrl.replace(/\/+$/, '')

  async function send<T>(path: string, init: RequestInit, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    let response: Response
    try {
      response = await doFetch(`${base}${path}`, { ...init, headers })
    } catch {
      throw new AuthApiError(0, 'network', 'network request failed')
    }

    if (!response.ok) {
      const code = await readErrorCode(response)
      if (response.status === 401 && code === 'unauthorized') options.onUnauthorized?.()
      throw new AuthApiError(response.status, code, `auth request failed: ${code}`, parseRetryAfter(response.headers))
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    register(input) {
      return send<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, password: input.password, display_name: input.displayName })
      })
    },
    login(input) {
      return send<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, password: input.password })
      })
    },
    me(token) {
      return send<{ user: AuthUser }>('/api/auth/me', { method: 'GET' }, token).then((body) => body.user)
    },
    changePassword(token, input) {
      return send<AuthResponse>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: input.currentPassword, new_password: input.newPassword })
      }, token)
    },
    logoutAll(token) {
      return send<void>('/api/auth/logout-all', { method: 'POST' }, token)
    }
  }
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`cd src && npx vitest run app/auth/client.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd crearte && git add src/app/auth
git commit -m "feat: add auth api client"
```

---

### 任务 6：会话状态

**文件：**
- 创建：`src/app/auth/session.ts`
- 测试：`src/app/auth/session.test.ts`

- [ ] **步骤 1：写失败的测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError } from './errors'
import { createAuthSession, toSession } from './session'
import { createSessionStore } from './storage'
import type { AuthResponse, AuthUser } from './types'

const USER: AuthUser = { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' }
const RESPONSE: AuthResponse = { token: 't1', expires_at: '2026-09-26T12:00:00Z', user: USER }
const CHANGED: AuthResponse = { token: 't2', expires_at: '2026-09-26T13:00:00Z', user: USER }

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  keys() { return [...this.data.keys()] }
}

function deps(overrides: Partial<Record<'login' | 'register' | 'me' | 'changePassword' | 'logoutAll', unknown>> = {}) {
  const client = {
    login: vi.fn().mockResolvedValue(RESPONSE),
    register: vi.fn().mockResolvedValue(RESPONSE),
    me: vi.fn().mockResolvedValue(USER),
    changePassword: vi.fn().mockResolvedValue(CHANGED),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
  return { client: client as never, clientRaw: client }
}

let storage: MemoryStorage
beforeEach(() => { storage = new MemoryStorage() })

describe('auth 会话', () => {
  it('login 写入凭证并置为已登录', async () => {
    const { client } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    expect(session.state.status).toBe('authenticated')
    expect(session.state.user?.email).toBe('a@example.com')
    expect(storage.getItem('crearte.auth.session.v1')).toContain('t1')
  })

  it('restore 无凭证时为匿名', async () => {
    const { client } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.restore()
    expect(session.state.status).toBe('anonymous')
    expect(session.state.user).toBeNull()
  })

  it('restore 乐观渲染（创建时同步恢复），复核成功后用服务端 user 覆盖', async () => {
    const { client, clientRaw } = deps()
    const store = createSessionStore(storage, () => Date.now())
    store.write(toSession(RESPONSE))
    clientRaw.me.mockResolvedValueOnce({ ...USER, display_name: '新名字' })

    const session = createAuthSession({ client, store })
    expect(session.state.user?.display_name).toBe('A')
    await session.restore()
    expect(session.state.user?.display_name).toBe('新名字')
  })

  it('restore 复核 401 时清态', async () => {
    const { client, clientRaw } = deps()
    const store = createSessionStore(storage, () => Date.now())
    store.write(toSession(RESPONSE))
    clientRaw.me.mockRejectedValueOnce(new AuthApiError(401, 'unauthorized', 'x'))

    const session = createAuthSession({ client, store })
    await session.restore()
    expect(session.state.status).toBe('anonymous')
    expect(store.read()).toBeNull()
  })

  it('restore 网络失败保留乐观状态', async () => {
    const { client, clientRaw } = deps()
    const store = createSessionStore(storage, () => Date.now())
    store.write(toSession(RESPONSE))
    clientRaw.me.mockRejectedValueOnce(new AuthApiError(0, 'network', 'x'))

    const session = createAuthSession({ client, store })
    await session.restore()
    expect(session.state.status).toBe('authenticated')
  })

  it('changePassword 换成新 token', async () => {
    const { client, clientRaw } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    clientRaw.changePassword.mockResolvedValueOnce(CHANGED)
    await session.changePassword('password1234', 'newpassword1')
    expect(session.state.user?.id).toBe('u1')
    expect(storage.getItem('crearte.auth.session.v1')).toContain('t2')
  })

  it('logout 只清本地,logoutAll 先调后端', async () => {
    const { client, clientRaw } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    session.logout()
    expect(session.state.status).toBe('anonymous')
    expect(clientRaw.logoutAll).not.toHaveBeenCalled()

    await session.login('a@example.com', 'password1234')
    await session.logoutAll()
    expect(clientRaw.logoutAll).toHaveBeenCalledWith('t1')
    expect(session.state.status).toBe('anonymous')
  })

  it('logoutAll 失败也清本地', async () => {
    const { client, clientRaw } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    clientRaw.logoutAll.mockRejectedValueOnce(new AuthApiError(500, 'internal', 'x'))
    await expect(session.logoutAll()).resolves.toBeUndefined()
    expect(session.state.status).toBe('anonymous')
  })

  it('invalidate 幂等', async () => {
    const { client } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    session.invalidate()
    session.invalidate()
    expect(session.state.status).toBe('anonymous')
    expect(storage.keys()).toHaveLength(0)
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd src && npx vitest run app/auth/session.test.ts`
预期：FAIL，`Failed to resolve import "./session"`

- [ ] **步骤 3：实现**

```ts
import { reactive } from 'vue'
import { AuthApiError } from './errors'
import type { SessionStore } from './storage'
import type { AuthResponse, AuthUser, Session } from './types'

export interface AuthSessionState {
  status: 'anonymous' | 'authenticated'
  user: AuthUser | null
}

type AuthClientLike = Pick<AuthClient, 'login' | 'register' | 'me' | 'changePassword' | 'logoutAll'>

export interface AuthSession {
  state: AuthSessionState
  restore(): Promise<void>
  login(email: string, password: string): Promise<void>
  register(email: string, displayName: string, password: string): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  logout(): void
  logoutAll(): Promise<void>
  invalidate(): void
}

export function toSession(response: AuthResponse): Session {
  return { token: response.token, expiresAt: response.expires_at, user: response.user }
}

export function createAuthSession(deps: { client: AuthClientLike; store: SessionStore }): AuthSession {
  const state = reactive<AuthSessionState>({ status: 'anonymous', user: null })
  let current: Session | null = deps.store.read()
  if (current) {
    // 同步恢复缓存会话：路由守卫在首次导航前就能拿到登录态（无需等待异步复核）
    state.user = current.user
    state.status = 'authenticated'
  }

  function apply(session: Session): void {
    current = session
    deps.store.write(session)
    state.user = session.user
    state.status = 'authenticated'
  }

  function invalidate(): void {
    current = null
    deps.store.clear()
    state.user = null
    state.status = 'anonymous'
  }

  return {
    state,
    invalidate,
    async restore() {
      const cached = current
      if (!cached) {
        invalidate()
        return
      }
      try {
        const user = await deps.client.me(cached.token)
        apply({ ...cached, user })
      } catch (error) {
        if (error instanceof AuthApiError && error.code === 'unauthorized') invalidate()
      }
    },
    async login(email, password) {
      apply(toSession(await deps.client.login({ email, password })))
    },
    async register(email, displayName, password) {
      apply(toSession(await deps.client.register({ email, password, displayName })))
    },
    async changePassword(currentPassword, newPassword) {
      if (!current) throw new AuthApiError(401, 'unauthorized', 'no active session')
      apply(toSession(await deps.client.changePassword(current.token, { currentPassword, newPassword })))
    },
    logout() {
      invalidate()
    },
    async logoutAll() {
      const token = current?.token
      if (!token) {
        invalidate()
        return
      }
      try {
        await deps.client.logoutAll(token)
      } catch {
        // 本地一律清态：无状态系统里服务端失败也不该把用户留在"看起来登录着"的状态
      }
      invalidate()
    }
  }
}
```

（`AuthClient` 类型通过 `import type { AuthClient } from './client'` 引入。）

- [ ] **步骤 4：运行测试确认通过**

运行：`cd src && npx vitest run app/auth/session.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd crearte && git add src/app/auth
git commit -m "feat: add auth session state"
```

---

### 任务 7：单例装配、启动恢复与登录页

**文件：**
- 创建：`src/app/auth/index.ts`
- 创建：`src/app/views/LoginView.vue`
- 修改：`src/app/router/index.ts`
- 修改：`src/app/main.ts`

- [ ] **步骤 1：写单例装配**

`src/app/auth/index.ts`：

```ts
import { createAuthClient } from './client'
import { createAuthSession, type AuthSession } from './session'
import { createSessionStore } from './storage'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

let sessionRef: AuthSession | null = null
const client = createAuthClient({
  baseUrl,
  onUnauthorized: () => sessionRef?.invalidate()
})
sessionRef = createAuthSession({ client, store: createSessionStore(window.localStorage) })

export const session: AuthSession = sessionRef
export * from './errors'
export * from './types'
```

- [ ] **步骤 2：写登录页**

`src/app/views/LoginView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { sanitizeNext, validateEmail } from '@/auth/validation'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = null
  const emailError = validateEmail(email.value)
  if (emailError) {
    error.value = AUTH_ERROR_MESSAGES[emailError]
    return
  }
  if (password.value === '') {
    error.value = '请输入密码'
    return
  }
  busy.value = true
  try {
    await session.login(email.value.trim().toLowerCase(), password.value)
    await router.replace(sanitizeNext(route.query.next))
  } catch (e) {
    error.value = toUserMessage(e)
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-md px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">登录</h1>
    <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="login-email">邮箱</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          autocomplete="email"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="login-password">密码</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <p v-if="error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <button type="submit" class="btn-ink lift w-full disabled:opacity-50" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>
    </form>
    <p class="mt-4 text-xs text-ink-soft">
      没有账号？
      <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/register">注册</RouterLink>
    </p>
  </section>
</template>
```

- [ ] **步骤 3：挂路由与守卫（本步只加 `/login`）**

`src/app/router/index.ts` 顶部 import 增加：

```ts
import { session } from '@/auth'
```

routes 数组在 `/docs/:slug` 之后加：

```ts
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
```

`createRouter` 调用之后加守卫：

```ts
router.beforeEach((to) => {
  if (to.meta.requiresAuth === true && session.state.status !== 'authenticated') {
    return { name: 'login', query: { next: to.fullPath } }
  }
  return true
})
```

（`/register` 与 `/account` 两条路由分别在任务 8、任务 9 加入，保证每个任务结束时仓库都能构建。）

- [ ] **步骤 4：启动时恢复会话并复核**

`src/app/main.ts` 改为：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { session } from './auth'
import './styles/main.css'

void session.restore()

createApp(App).use(router).mount('#app')
```

- [ ] **步骤 5：验收**

运行：`cd src && npx vitest run && npm run typecheck`
预期：全部 PASS（沿用既有单测；本任务新增的是装配与视图）

- [ ] **步骤 6：Commit**

```bash
cd crearte && git add src/app/auth/index.ts src/app/views/LoginView.vue src/app/router/index.ts src/app/main.ts
git commit -m "feat: add auth session wiring and login view"
```

---

### 任务 8：注册页

**文件：**
- 创建：`src/app/views/RegisterView.vue`
- 修改：`src/app/router/index.ts`

- [ ] **步骤 1：写注册页**

`src/app/views/RegisterView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { validateDisplayName, validateEmail, validatePassword } from '@/auth/validation'

const router = useRouter()
const email = ref('')
const displayName = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = null
  const code = validateEmail(email.value) ?? validateDisplayName(displayName.value) ?? validatePassword(password.value)
  if (code) {
    error.value = AUTH_ERROR_MESSAGES[code]
    return
  }
  busy.value = true
  try {
    await session.register(email.value.trim().toLowerCase(), displayName.value.trim(), password.value)
    await router.replace('/')
  } catch (e) {
    error.value = toUserMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-md px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">注册</h1>
    <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-email">邮箱</label>
        <input
          id="register-email"
          v-model="email"
          type="email"
          autocomplete="email"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-name">昵称</label>
        <input
          id="register-name"
          v-model="displayName"
          type="text"
          autocomplete="nickname"
          maxlength="60"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-password">密码（10–128 个字符）</label>
        <input
          id="register-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <p v-if="error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <button type="submit" class="btn-ink lift w-full disabled:opacity-50" :disabled="busy">
        {{ busy ? '注册中…' : '注册' }}
      </button>
    </form>
    <p class="mt-4 text-xs text-ink-soft">
      已有账号？
      <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/login">登录</RouterLink>
    </p>
  </section>
</template>
```

- [ ] **步骤 2：加路由**

`src/app/router/index.ts` 的 `/login` 之后加：

```ts
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
```

- [ ] **步骤 3：验收**

运行：`cd src && npx vitest run && npm run typecheck`
预期：PASS

- [ ] **步骤 4：Commit**

```bash
cd crearte && git add src/app/views/RegisterView.vue src/app/router/index.ts
git commit -m "feat: add register view"
```

---

### 任务 9：账号页（身份 / 改密 / 登出全部 / 登出）

**文件：**
- 创建：`src/app/views/AccountView.vue`
- 修改：`src/app/router/index.ts`

- [ ] **步骤 1：写账号页**

`src/app/views/AccountView.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { validatePassword } from '@/auth/validation'
import type { UserRole } from '@/auth/types'

const router = useRouter()
const user = computed(() => session.state.user)
const roleLabel = computed(() => (user.value ? ROLE_LABELS[user.value.role] : ''))

const ROLE_LABELS: Record<UserRole, string> = { user: '普通用户', admin: '管理员' }

const currentPassword = ref('')
const newPassword = ref('')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)
const confirmingLogoutAll = ref(false)

watch(
  () => session.state.status,
  (status) => {
    if (status !== 'authenticated') void router.replace({ name: 'login', query: { next: '/account' } })
  }
)

async function changePassword(): Promise<void> {
  if (busy.value || !user.value) return
  error.value = null
  notice.value = null
  const code = validatePassword(newPassword.value)
  if (code) {
    error.value = AUTH_ERROR_MESSAGES[code]
    return
  }
  if (currentPassword.value === '') {
    error.value = '请输入当前密码'
    return
  }
  busy.value = true
  try {
    await session.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    notice.value = '密码已更新，其他设备需要重新登录。'
  } catch (e) {
    error.value = toUserMessage(e)
  } finally {
    busy.value = false
  }
}

async function logoutAll(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    await session.logoutAll()
    confirmingLogoutAll.value = false
    await router.replace({ name: 'login' })
  } finally {
    busy.value = false
  }
}

function logout(): void {
  session.logout()
  void router.replace('/')
}
</script>

<template>
  <section class="mx-auto w-full max-w-xl px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">我的账号</h1>

    <dl v-if="user" class="mt-6 border-2 border-ink bg-surface p-4 shadow-hard">
      <div class="flex flex-wrap items-baseline gap-2">
        <dt class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">昵称</dt>
        <dd class="text-sm font-bold">{{ user.display_name }}</dd>
      </div>
      <div class="mt-2 flex flex-wrap items-baseline gap-2">
        <dt class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">邮箱</dt>
        <dd class="text-sm">{{ user.email }}</dd>
      </div>
      <div class="mt-2 flex flex-wrap items-baseline gap-2">
        <dt class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">角色</dt>
        <dd class="text-sm">{{ roleLabel }}</dd>
      </div>
    </dl>

    <form class="mt-8 space-y-4" novalidate @submit.prevent="changePassword">
      <h2 class="font-display text-lg font-black">修改密码</h2>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="account-current">当前密码</label>
        <input id="account-current" v-model="currentPassword" type="password" autocomplete="current-password" class="w-full border-2 border-ink bg-surface px-3 py-2">
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="account-new">新密码（10–128 个字符）</label>
        <input id="account-new" v-model="newPassword" type="password" autocomplete="new-password" class="w-full border-2 border-ink bg-surface px-3 py-2">
      </div>
      <p v-if="error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <p v-if="notice" role="status" aria-live="polite" class="border-2 border-ink bg-surface px-3 py-2 text-xs">{{ notice }}</p>
      <button type="submit" class="btn-ink lift disabled:opacity-50" :disabled="busy">更新密码</button>
    </form>

    <section class="mt-10 space-y-3 border-t-[3px] border-ink pt-6">
      <h2 class="font-display text-lg font-black">会话</h2>
      <p class="text-xs text-ink-soft">登出全部设备会让所有已签发的登录凭证立即失效（包括当前设备）。</p>
      <div v-if="confirmingLogoutAll" class="flex flex-wrap gap-2">
        <button type="button" class="btn-ink lift disabled:opacity-50" :disabled="busy" @click="logoutAll">确认登出全部</button>
        <button type="button" class="btn-surface lift" @click="confirmingLogoutAll = false">取消</button>
      </div>
      <button v-else type="button" class="btn-surface lift" @click="confirmingLogoutAll = true">登出全部设备</button>
      <button type="button" class="btn-surface lift ml-0 sm:ml-2" @click="logout">登出</button>
    </section>
  </section>
</template>
```

- [ ] **步骤 2：加路由（带 `requiresAuth`）**

`src/app/router/index.ts` 的 `/register` 之后加：

```ts
    { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { requiresAuth: true } },
```

- [ ] **步骤 3：验收**

运行：`cd src && npx vitest run && npm run typecheck`
预期：PASS

- [ ] **步骤 4：Commit**

```bash
cd crearte && git add src/app/views/AccountView.vue src/app/router/index.ts
git commit -m "feat: add account view"
```

---

### 任务 10：header 三态入口

**文件：**
- 修改：`src/app/components/AppHeader.vue`

- [ ] **步骤 1：改 script**

`AppHeader.vue` 的 `<script setup>` 增加：

```ts
import { session } from '@/auth'

const user = computed(() => session.state.user)

function logout(): void {
  session.logout()
}
```

（`computed` 已在原文件的 import 中。）

- [ ] **步骤 2：改 template**

把原来右侧那枚 `<span class="ml-auto …">{{ sticker }}</span>` 替换为下面两段（贴纸保留，登录态放在贴纸右侧）：

```vue
      <span
        class="ml-auto hidden border-2 border-ink bg-highlight px-2 py-0.5 font-mono text-[0.6875rem] tracking-[0.05em] sm:inline-block"
      >{{ sticker }}</span>

      <RouterLink
        v-if="!user"
        to="/login"
        class="border-2 border-ink bg-surface px-2 py-1 text-xs font-bold"
      >登录</RouterLink>

      <details v-else class="relative">
        <summary class="cursor-pointer border-2 border-ink bg-surface px-2 py-1 text-xs font-bold">{{ user.display_name }}</summary>
        <div class="absolute right-0 z-50 mt-1 w-32 border-2 border-ink bg-surface shadow-hard">
          <RouterLink to="/account" class="block px-3 py-2 text-xs font-bold hover:bg-paper">我的账号</RouterLink>
          <button type="button" class="block w-full border-t-2 border-ink px-3 py-2 text-left text-xs font-bold hover:bg-paper" @click="logout">登出</button>
        </div>
      </details>
```

- [ ] **步骤 3：验收**

运行：`cd src && npx vitest run && npm run typecheck && npm run build`
预期：PASS（`build` 会跑 `build-data.mjs` 与 `vue-tsc`）

- [ ] **步骤 4：Commit**

```bash
cd crearte && git add src/app/components/AppHeader.vue
git commit -m "feat: add auth entry in header"
```

---

### 任务 11：账号链路 e2e

**文件：**
- 创建：`src/e2e/auth.spec.ts`
- 修改：`src/package.json`（`build:e2e` 注入 `VITE_API_BASE_URL`）

- [ ] **步骤 1：e2e 构建注入 API 地址**

`src/package.json` 的 `build:e2e` 改为：

```json
    "build:e2e": "node scripts/build-fixtures.mjs && node scripts/build-data.mjs --with-fixtures && VITE_GAMES_BASE_DOMAIN=localhost:4173 VITE_HOST_ORIGIN=http://localhost:4173 VITE_API_BASE_URL=http://localhost:8080 vite build && VITE_GAMES_BASE_DOMAIN=localhost:4173 VITE_HOST_ORIGIN=http://localhost:4173 node scripts/build-runtime.mjs",
```

- [ ] **步骤 2：写 e2e**

`src/e2e/auth.spec.ts`：

```ts
import { expect, test, type Page, type Route } from '@playwright/test'

const API = 'http://localhost:8080'

interface FixtureState {
  users: Map<string, { password: string; display_name: string }>
  tokens: Map<string, string>
  nextToken: number
  loginFailures: number
}

function authResponse(state: FixtureState, email: string, token: string) {
  const user = state.users.get(email)!
  return {
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    user: { id: `u-${email}`, email, display_name: user.display_name, role: 'user' }
  }
}

async function installAuthApi(page: Page): Promise<FixtureState> {
  const state: FixtureState = { users: new Map(), tokens: new Map(), nextToken: 1, loginFailures: 0 }

  await page.route(`${API}/api/auth/**`, async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON?.() ?? {}
    const token = (request.headers()['authorization'] ?? '').replace('Bearer ', '')
    const email = token ? state.tokens.get(token) : undefined

    const json = (status: number, payload: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    const fail = (status: number, code: string) => json(status, { error: { code, message: code } })

    if (path.endsWith('/register')) {
      if (state.users.has(body.email)) return fail(409, 'email_taken')
      state.users.set(body.email, { password: body.password, display_name: body.display_name })
      const newToken = `t${state.nextToken++}`
      state.tokens.set(newToken, body.email)
      return json(201, authResponse(state, body.email, newToken))
    }
    if (path.endsWith('/login')) {
      const user = state.users.get(body.email)
      if (!user || user.password !== body.password) {
        state.loginFailures += 1
        return fail(401, 'invalid_credentials')
      }
      const newToken = `t${state.nextToken++}`
      state.tokens.set(newToken, body.email)
      return json(200, authResponse(state, body.email, newToken))
    }
    if (path.endsWith('/me')) {
      if (!email) return fail(401, 'unauthorized')
      return json(200, { user: authResponse(state, email, token).user })
    }
    if (path.endsWith('/change-password')) {
      if (!email) return fail(401, 'unauthorized')
      const user = state.users.get(email)!
      if (user.password !== body.current_password) return fail(401, 'invalid_credentials')
      user.password = body.new_password
      state.tokens.delete(token)
      const newToken = `t${state.nextToken++}`
      state.tokens.set(newToken, email)
      return json(200, authResponse(state, email, newToken))
    }
    if (path.endsWith('/logout-all')) {
      if (!email) return fail(401, 'unauthorized')
      for (const [key, value] of state.tokens) if (value === email) state.tokens.delete(key)
      return route.fulfill({ status: 204, body: '' })
    }
    return fail(404, 'not_found')
  })

  return state
}

const EMAIL = 'demo@example.com'
const PASSWORD = 'password1234'

test('注册 → 账号页改密 → 登出全部', async ({ page }) => {
  const state = await installAuthApi(page)

  await page.goto('/register')
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('昵称').fill('Demo')
  await page.getByLabel(/密码/).fill(PASSWORD)
  await page.getByRole('button', { name: '注册' }).click()

  await expect(page.getByRole('button', { name: 'Demo' })).toBeVisible()
  await page.goto('/account')
  await expect(page.getByText(EMAIL)).toBeVisible()
  await expect(page.getByText('普通用户')).toBeVisible()

  await page.getByLabel('当前密码').fill(PASSWORD)
  await page.getByLabel(/新密码/).fill('newpassword1')
  await page.getByRole('button', { name: '更新密码' }).click()
  await expect(page.getByText('密码已更新，其他设备需要重新登录。')).toBeVisible()
  expect(state.users.get(EMAIL)?.password).toBe('newpassword1')

  await page.getByRole('button', { name: '登出全部设备' }).click()
  await page.getByRole('button', { name: '确认登出全部' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('未登录访问 /account 跳登录并回跳', async ({ page }) => {
  await installAuthApi(page)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/)

  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('邮箱或密码不正确')).toBeVisible()
})

test('注册撞 409 提示已注册,登录成功后可回跳 /account', async ({ page }) => {
  const state = await installAuthApi(page)
  state.users.set(EMAIL, { password: PASSWORD, display_name: 'Demo' })

  await page.goto('/register')
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('昵称').fill('Demo')
  await page.getByLabel(/密码/).fill(PASSWORD)
  await page.getByRole('button', { name: '注册' }).click()
  await expect(page.getByText('该邮箱已注册，可直接登录')).toBeVisible()

  await page.getByRole('link', { name: '登录' }).click()
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Demo' })).toBeVisible()
})

test('登录 429 显示倒计时提示', async ({ page }) => {
  await page.route(`${API}/api/auth/login`, (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '30' },
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'too many requests' } })
    })
  )

  await page.goto('/login')
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('操作太频繁，请 30 秒后重试')).toBeVisible()
})
```

- [ ] **步骤 3：运行 e2e**

运行：`cd src && npm run e2e -- e2e/auth.spec.ts`
预期：4 passed（首次会先 build，约 1–3 分钟）

- [ ] **步骤 4：跑全量 e2e 确认没有回归**

运行：`cd src && npm run e2e`
预期：全部通过（既有 core/degrade/update/save/lifecycle/hosted/crash 用例不受影响）

- [ ] **步骤 5：Commit**

```bash
cd crearte && git add src/e2e/auth.spec.ts src/package.json
git commit -m "test: add auth e2e"
```

---

### 任务 12：环境变量、文档与最终验收

**文件：**
- 创建：`src/.env.development`
- 修改：`docs/README.md`
- 修改：`docs/CHANGELOG.md`

- [ ] **步骤 1：dev 环境变量**

`src/.env.development`：

```
VITE_API_BASE_URL=http://localhost:8080
```

- [ ] **步骤 2：文档补环境变量与本地联调**

`docs/README.md` 末尾追加：

```markdown
## 环境变量

| 变量 | 用途 | 例子 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 后端 API 基地址（无尾斜杠） | 生产 `https://api.crearte.yoresee.cc`；dev 见 `src/.env.development` |
| `VITE_HOST_ORIGIN` | 宿主站 origin（游戏运行时用） | `https://crearte.yoresee.cc` |
| `VITE_GAMES_BASE_DOMAIN` | 游戏子域基域 | `crearte-games.yoresee.cc` |

## 账号系统本地联调

1. 起后端依赖与后端：`cd crearte-server && docker compose -f deploy/docker-compose.dev.yml up -d`，再按该仓 `docs/README.md` 起 `go run ./cmd serve`
2. 后端 `.env`：`DATABASE_URL`、`AUTH_TOKEN_SECRET`、`BUNDLE_KEK_*` 三项必备；跨域联调时把 `CORS_ALLOWED_ORIGINS` 设为前端 dev 地址（如 `http://localhost:5173`）
3. 前端：`cd src && npm install && npm run dev`，默认读 `src/.env.development` 直连 `http://localhost:8080`
```

- [ ] **步骤 3：CHANGELOG 0.3.0**

在 `docs/CHANGELOG.md` 的 `## [0.2.0]` 之上插入：

```markdown
## [0.3.0] - 2026-09-19

### Added / 新增

- Added the account system UI: register, login, account page with password change and logout-all, plus a three-state header entry backed by a local-JWT-aware session store.
- 新增账号系统界面：注册、登录、账号页（改密与登出全部设备），以及基于本地凭证会话的 header 三态入口。
```

- [ ] **步骤 4：最终验收**

运行：

```bash
cd crearte/src && npm run check && npm run e2e
```

预期：vitest 全绿、`vue-tsc` 无错、`vite build` 成功、Playwright 全绿。

手工冒烟（可选，需真后端 + PG）：注册 → 登录 → 改密（旧标签页操作应立即 401 并回未登录）→ 登出全部。

- [ ] **步骤 5：Commit**

```bash
cd crearte && git add src/.env.development docs/README.md docs/CHANGELOG.md
git commit -m "docs: document auth integration setup"
```

---

## Plan Self-Review Notes

- **规格覆盖度**：§4 模块结构 → 任务 2–6、7；§5 会话与凭证（存储/生命周期/安全）→ 任务 3、6；§6 API 契约与错误映射 → 任务 2、5；§7 界面与交互（含 `next` 净化、角色标签）→ 任务 7、8、9、10；§8 环境与部署前置 → 任务 11、12；§9 后端 CORS → 任务 1；§10 测试与验收 → 各任务步骤 + 任务 11、12；§11 错误处理汇总 → 任务 2（文案表）+ 各视图的 `toUserMessage`；§12 风险 → 无代码任务，属说明性内容。
- **占位符检查**：无"待定/TODO/类似上面"；每个代码步骤都给了完整可粘贴内容。
- **类型一致性**：`AuthUser`/`Session`/`AuthResponse` 在任务 2 定义，任务 3、5、6 消费；`SessionStore`（任务 3）与 `createAuthSession`（任务 6）签名一致；`AuthApiError(status, code, message, retryAfterSeconds)` 在任务 2 定义、任务 5 构造、任务 6 判别；`session.state.status` 在任务 6 定义、任务 7 守卫与任务 9 watch 消费；`sanitizeNext` 任务 4 定义、任务 7 消费。
- **顺序依赖**：任务 1 独立（另一仓库）；任务 2→3→4→5→6 严格顺序；任务 7 只加 `/login`，任务 8 加 `/register`，任务 9 加 `/account`，保证每个任务结束时都能构建。
- **已知取舍**：视图层不做 vitest 组件测试（仓库现有测试均为纯 TS 模块），UI 行为交给 Playwright e2e 覆盖；`logout-all` 前端不收 429/5xx 之外的特殊分支（按规格：失败也清本地）。
