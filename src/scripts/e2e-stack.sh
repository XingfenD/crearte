#!/usr/bin/env bash
# 真栈 smoke 编排：postgres + MinIO + 后端 serve + 前端构建/静态服务。
# 依赖缺失（docker 不可用 / 无兄弟后端仓 / go 构建失败）→ skip 模式：
# 不写 stack.json，full-loop.spec 自动跳过；前端照常起（其余套件不受影响）。
set -uo pipefail

FRONT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(dirname "$FRONT_ROOT")"
# ⚠️ 路径适配（本机实际布局，替代简报的 Mac 假设）：FRONT_ROOT=…/crearte_mono/crearte/src（package.json 在 src/ 下），
# REPO_ROOT=…/crearte_mono/crearte（前端仓根）→ 后端兄弟仓须再上一层：…/crearte_mono/crearte-server。
# 简报原文 BACKEND="$REPO_ROOT/crearte-server" 在本机指向不存在路径 → stack_ok=0 → 假绿 SKIP（已实测复现）。
BACKEND="$(dirname "$REPO_ROOT")/crearte-server"
# 后端命名空间实现只存在于 origin/feat/user-namespace（可用 CREARTE_STACK_BACKEND_REF 覆盖，默认取该 ref）；
# 兄弟仓工作树可能在 master（无该代码）。
# 用 worktree 取 origin ref（**不切 xf 的分支、不碰其工作树**），放 /tmp 避免污染仓库。
BACKEND_REF="${CREARTE_STACK_BACKEND_REF:-origin/feat/user-namespace}"
BACKEND_WT="/tmp/crearte-stack-backend"
BACKEND_SRC="$BACKEND_WT/src"
# ⚠️ 默认 GOPROXY=proxy.golang.org 在本机**下载超时**（实测 180s 卡 aws-sdk 四个包，EXIT=124），
# 导致 build 失败 → stack_ok=0 → skip = 假绿。goproxy.cn 实测可用（EXIT=0）。
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"
STACK_FILE="$FRONT_ROOT/fixtures/generated/stack.json"
DB_PORT=5433 MINIO_PORT=9001 API_PORT=8091 WEB_PORT=4175
ADMIN_EMAIL="admin@stack.local" ADMIN_USERNAME="admin" ADMIN_PASSWORD="stack-admin-password"
SERVER_BIN="/tmp/crearte-stack-server"
# ⚠️ 裸 `go` 在本机是 1.18.1，无法解析后端 go.mod（要求 go 1.24.1）→ build 静默失败 →
# stack_ok=0 → skip 模式 → full-loop.spec 自动跳过 = **假绿**（什么都没测却报通过）。
# 优先用 /usr/local/go/bin/go（实测 1.26.8），回退到 PATH 里的 go。
GO_BIN="/usr/local/go/bin/go"
command -v "$GO_BIN" >/dev/null 2>&1 || GO_BIN="$(command -v go 2>/dev/null || true)"

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null
  docker rm -f crearte-stack-db crearte-stack-minio >/dev/null 2>&1
  git -C "$BACKEND" worktree remove --force "$BACKEND_WT" >/dev/null 2>&1
  rm -f "$STACK_FILE"
}
trap cleanup EXIT
# ⚠️ bash 收到未捕获的 SIGTERM/SIGHUP 会直接终止、**不跑 EXIT trap**。playwright 的
# gracefulShutdown 发的正是 SIGTERM，故显式把它转成 exit（143=128+15）以触发 cleanup。
# （若 playwright 未配 gracefulShutdown 则用 SIGKILL，不可捕获 → 靠下面的起始清残留兜底。）
trap 'exit 143' TERM INT
# 起始先清上次残留（即使上次被 SIGKILL 没清干净）：陈旧 stack.json 的 ready:true 会让
# 本次在栈没起时误判为可用（二次假绿），故无条件先删。
rm -f "$STACK_FILE"

stack_ok=1
command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || stack_ok=0
[ -d "$BACKEND/.git" ] || stack_ok=0
# go 版本地板：需 >= 1.24（后端 go.mod 要求）；否则 skip 是真环境缺失而非工具链错配
[ -n "$GO_BIN" ] && "$GO_BIN" version 2>/dev/null | grep -qE 'go1\.([3-9][0-9]|2[4-9])' || stack_ok=0

if [ "$stack_ok" = 1 ]; then
  echo "[stack] checking out backend $BACKEND_REF → $BACKEND_WT…"
  git -C "$BACKEND" fetch --quiet origin "$BACKEND_REF" >/dev/null 2>&1
  git -C "$BACKEND" worktree remove --force "$BACKEND_WT" >/dev/null 2>&1
  git -C "$BACKEND" worktree add --detach "$BACKEND_WT" "$BACKEND_REF" >/dev/null 2>&1 || stack_ok=0
  # 硬校验：取到的树必须真含内容管线 + 命名空间双段路由，否则编出来的是旧后端（full-loop 会全挂）
  grep -q 'api/submissions' "$BACKEND_SRC/internal/api/router.go" 2>/dev/null || stack_ok=0
  grep -q ':user/:slug' "$BACKEND_SRC/internal/api/router.go" 2>/dev/null || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  echo "[stack] starting postgres + minio…"
  docker rm -f crearte-stack-db crearte-stack-minio >/dev/null 2>&1
  docker run -d --name crearte-stack-db -e POSTGRES_USER=crearte -e POSTGRES_PASSWORD=crearte \
    -e POSTGRES_DB=crearte -p "$DB_PORT:5432" postgres:17-alpine >/dev/null || stack_ok=0
  docker run -d --name crearte-stack-minio -p "$MINIO_PORT:9000" \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
    -e MINIO_API_CORS_ALLOW_ORIGIN='*' pgsty/minio:latest server /data >/dev/null || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  for _ in $(seq 1 60); do curl -sf "http://localhost:$MINIO_PORT/minio/health/live" >/dev/null && break; sleep 1; done
  # 容器内 mc 对 localhost 即 MinIO 自身（9000 为容器内端口）
  docker exec crearte-stack-minio mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1
  docker exec crearte-stack-minio mc mb --ignore-existing local/crearte >/dev/null 2>&1
  docker exec crearte-stack-minio mc anonymous set download local/crearte >/dev/null 2>&1
  for _ in $(seq 1 60); do docker exec crearte-stack-db pg_isready -U crearte >/dev/null 2>&1 && break; sleep 1; done

  echo "[stack] building backend…"
  (cd "$BACKEND_SRC" && "$GO_BIN" build -o "$SERVER_BIN" ./cmd) || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  echo "[stack] starting backend on :$API_PORT…"
  # ⚠️ Task11 偏差（非简报原文）：必须显式设 CORS_ALLOWED_ORIGINS，否则主站 origin http://localhost:$WEB_PORT
  # 被 cors.go allowed() 拒（默认 GAMES_BASE_DOMAIN=localhost 只放行 *.localhost 子域的 http）→ 预检 OPTIONS
  # 无 ACAO 头 → 浏览器端注册/提交 fetch 全挂（实测：UI 报「网络连接失败」，而脚本 curl 注册成功）。
  # 游戏子域 <id>.localhost:$WEB_PORT 仍由默认规则放行，SW 取钥不受影响。
  (cd "$BACKEND_SRC" && \
    PORT=$API_PORT \
    DATABASE_URL="postgres://crearte:crearte@localhost:$DB_PORT/crearte?sslmode=disable" \
    AUTH_TOKEN_SECRET="$(openssl rand -base64 32)" \
    BUNDLE_KEK_ACTIVE=k1 BUNDLE_KEK_k1="$(openssl rand -base64 32)" \
    STORAGE_S3_ENDPOINT="http://localhost:$MINIO_PORT" STORAGE_S3_BUCKET=crearte \
    STORAGE_S3_ACCESS_KEY_ID=minioadmin STORAGE_S3_SECRET_ACCESS_KEY=minioadmin \
    STORAGE_S3_FORCE_PATH_STYLE=true \
    CORS_ALLOWED_ORIGINS="http://localhost:$WEB_PORT" \
    "$SERVER_BIN" serve) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$API_PORT/healthz" >/dev/null && break; sleep 1; done
  curl -sf "http://localhost:$API_PORT/healthz" >/dev/null || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  curl -sf -X POST "http://localhost:$API_PORT/api/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\",\"display_name\":\"Stack Admin\"}" >/dev/null || stack_ok=0
  # 复用已编好的 $SERVER_BIN（cmd 含 user 子命令），避免第二次 go run 重新编译
  if [ "$stack_ok" = 1 ]; then
    DATABASE_URL="postgres://crearte:crearte@localhost:$DB_PORT/crearte?sslmode=disable" \
      "$SERVER_BIN" user set-role "$ADMIN_EMAIL" admin >/dev/null 2>&1 || stack_ok=0
  fi
fi

if [ "$stack_ok" = 1 ]; then
  echo "[stack] building frontend (api base :$API_PORT)…"
  (cd "$FRONT_ROOT" && npm run build:e2e:stack) || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  mkdir -p "$(dirname "$STACK_FILE")"
  cat > "$STACK_FILE" <<JSON
{ "ready": true, "apiBase": "http://localhost:$API_PORT", "webBase": "http://localhost:$WEB_PORT", "adminEmail": "$ADMIN_EMAIL", "adminPassword": "$ADMIN_PASSWORD" }
JSON
  echo "[stack] ready: api=$API_PORT web=$WEB_PORT admin=$ADMIN_EMAIL"
else
  echo "[stack] dependencies missing — running in SKIP mode (frontend only, full-loop will skip)"
  (cd "$FRONT_ROOT" && npm run build:e2e) || exit 1
fi

# ⚠️ 不用 exec：exec 替换进程映像会使上面的 trap **永不触发**。后台起 + wait：
# playwright gracefulShutdown 发 SIGTERM → 命中 TERM trap → exit 143 → EXIT trap → cleanup。
# （wait 会被信号中断从而让 trap 得以运行；若 node 前台跑，信号只送 node 不送脚本。）
node "$FRONT_ROOT/scripts/serve-runtime.mjs" --port "$WEB_PORT" &
WEB_PID=$!
wait "$WEB_PID"
