<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import StatePanel from '@/components/StatePanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import { useAsync } from '@/composables/useAsync'
import { apiRepo } from '@/data'
import type { GameSummary } from '@/data/types'
import { contentClient, toContentMessage, type SubmissionView } from '@/content'
import { EMPTY_FEATURES, FEATURE_ITEMS, collectFeatures, featuresToForm, type EditableFeatures } from '@/content/features'

const LIMIT = 20
const tab = ref<'queue' | 'works'>('queue')
const status = ref<'pending' | 'approved' | 'rejected'>('pending')
const offset = ref(0)
const worksOffset = ref(0)
const actionError = ref<string | null>(null)
const busyKey = ref<string | null>(null)

const { data: queueData, error: queueError, loading: queueLoading, reload: reloadQueue } = useAsync(
  () => contentClient.adminListSubmissions({ status: status.value, limit: LIMIT, offset: offset.value }),
  [status, offset]
)
const { data: worksData, error: worksError, loading: worksLoading, reload: reloadWorks } = useAsync<GameSummary[]>(
  () => (apiRepo ? apiRepo.listGames() : Promise.reject(new Error('未配置内容 API'))),
  [tab]
)
const { data: historyData, error: historyError, loading: historyLoading, reload: reloadHistory } = useAsync(
  () => contentClient.adminListSubmissions({ status: 'approved', limit: LIMIT, offset: worksOffset.value }),
  [worksOffset, tab]
)

// virtual 作品的当前版本：行展开时懒加载详情
const expanded = ref<string | null>(null)
const versionOf = ref<Record<string, string | null>>({})
// 展开行的运行权限勾选态（admin 可改已发布作品的 CSP 开关）
const featuresOf = ref<Record<string, EditableFeatures>>({})

const KIND_LABELS: Record<string, string> = { new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新' }
const TAB_ITEMS = [
  { value: 'queue', label: '审核队列' },
  { value: 'works', label: '作品管理' }
]
const STATUS_ITEMS = [
  { value: 'pending', label: '待审' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' }
]
const queueSubs = computed(() => queueData.value?.submissions ?? [])
const queueTotal = computed(() => queueData.value?.total ?? 0)
const historySubs = computed(() => historyData.value?.submissions ?? [])
const historyTotal = computed(() => historyData.value?.total ?? 0)

function nameOf(s: SubmissionView): string {
  return s.payload?.name?.trim() || s.work_id
}
function versionOfSub(s: SubmissionView): string {
  return s.payload?.version ?? '—'
}

async function run(key: string, fn: () => Promise<unknown>, then?: () => void): Promise<void> {
  if (busyKey.value) return
  busyKey.value = key
  actionError.value = null
  try {
    await fn()
    then?.()
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busyKey.value = null
  }
}

async function toggleVersions(id: string): Promise<void> {
  expanded.value = expanded.value === id ? null : id
  // 展开即同步落默认勾选态：详情返回前 UI 也可交互，且避免模板读 undefined
  if (expanded.value === id && !featuresOf.value[id]) {
    featuresOf.value = { ...featuresOf.value, [id]: { ...EMPTY_FEATURES } }
  }
  if (expanded.value === id && versionOf.value[id] === undefined && apiRepo) {
    try {
      const game = await apiRepo.getGame(id)
      versionOf.value = { ...versionOf.value, [id]: game.version ?? null }
      featuresOf.value = { ...featuresOf.value, [id]: featuresToForm(game.features) }
    } catch (e) {
      // 不写 null：null ≠ undefined 会让再展开也不重试、且吊销/恢复按钮的 v-if 永假。
      // 保持 undefined 以便重试，收起展开态（按钮回到「查看」），错误走本页既有 alert
      expanded.value = null
      actionError.value = toContentMessage(e)
    }
  }
}

// 保存运行权限：只更新 works.features 单列，作品详情 API 随之返回新值（SW 按它注入 CSP）
async function saveFeatures(id: string): Promise<void> {
  const draft = featuresOf.value[id] ?? { ...EMPTY_FEATURES }
  await run(`feat-${id}`, () => contentClient.adminSetFeatures(id, collectFeatures(draft)))
}

// StatePanel 直出 error.message（后端原文，如 "admin role required"），过一遍 toContentMessage
// 与 actionError 保持一致的中文映射。不动 StatePanel/useAsync 冻结面（Task 7 同构已放行）
function panelError(e: Error | null): Error | null {
  return e ? new Error(toContentMessage(e)) : null
}

function switchTab(next: 'queue' | 'works'): void {
  tab.value = next
  actionError.value = null
}
function switchStatus(next: 'pending' | 'approved' | 'rejected'): void {
  status.value = next
  offset.value = 0
}
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-[1.75rem] font-black leading-tight">审核管理</h1>
      <nav class="flex gap-2 text-xs font-bold">
        <RouterLink to="/admin/users" class="border-2 border-ink bg-surface px-2 py-1 hover:bg-paper">用户管理</RouterLink>
        <RouterLink to="/admin/audit" class="border-2 border-ink bg-surface px-2 py-1 hover:bg-paper">操作日志</RouterLink>
      </nav>
    </div>

    <BaseTabs
      class="mt-4"
      :model-value="tab"
      :items="TAB_ITEMS"
      @update:model-value="switchTab($event as 'queue' | 'works')"
    />

    <p v-if="actionError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

    <!-- Tab 1：审核队列 -->
    <div v-if="tab === 'queue'" class="mt-6">
      <BaseTabs
        tone="highlight"
        size="sm"
        :model-value="status"
        :items="STATUS_ITEMS"
        @update:model-value="switchStatus($event as 'pending' | 'approved' | 'rejected')"
      />
      <StatePanel variant="lines" class="mt-4" :loading="queueLoading" :error="panelError(queueError)" @retry="reloadQueue">
        <p v-if="queueSubs.length === 0" class="border-2 border-ink bg-surface p-6 text-sm text-ink-soft shadow-hard">该状态下没有提交。</p>
        <table v-else class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
          <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
            <tr><th class="px-3 py-2 text-left">作品</th><th class="px-3 py-2 text-left">类型</th><th class="px-3 py-2 text-left">提交</th><th class="px-3 py-2 text-left">更新</th><th class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-for="s in queueSubs" :key="s.id" :data-testid="`queue-${s.id}`" class="border-b-[1.5px] border-ink">
              <td class="px-3 py-2"><span class="font-bold">{{ nameOf(s) }}</span><span class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ s.work_id }}</span></td>
              <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ KIND_LABELS[s.kind] ?? s.kind }}</td>
              <td class="px-3 py-2 font-mono text-[0.625rem]">{{ s.id.slice(0, 8) }}</td>
              <td class="px-3 py-2 font-mono text-[0.625rem]">{{ s.updated_at.slice(0, 10) }}</td>
              <td class="px-3 py-2 text-right">
                <RouterLink :to="`/admin/submissions/${s.id}`" class="border-2 border-ink bg-surface px-2 py-1 text-xs font-bold hover:bg-paper">审核</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
        <BasePagination v-model:offset="offset" class="mt-3" :limit="LIMIT" :total="queueTotal" />
      </StatePanel>
    </div>

    <!-- Tab 2：作品管理 -->
    <div v-else class="mt-6 space-y-8">
      <StatePanel variant="lines" :loading="worksLoading" :error="panelError(worksError)" @retry="reloadWorks">
        <table class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
          <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
            <tr><th class="px-3 py-2 text-left">作品</th><th class="px-3 py-2 text-left">运行时</th><th class="px-3 py-2 text-left">当前版本</th><th class="px-3 py-2 text-left">操作</th></tr>
          </thead>
          <tbody>
            <template v-for="g in worksData ?? []" :key="g.id">
              <tr :data-testid="`work-row-${g.id}`" class="border-b-[1.5px] border-ink">
                <td class="px-3 py-2"><span class="font-bold">{{ g.name }}</span><span class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ g.id }}</span></td>
                <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ g.runtime ?? 'external' }}</td>
                <td class="px-3 py-2 font-mono text-[0.6875rem]">
                  <template v-if="g.runtime === 'virtual'">
                    <BaseButton size="sm" @click="toggleVersions(g.id)">
                      {{ expanded === g.id ? (versionOf[g.id] ?? '加载中…') : '查看' }}
                    </BaseButton>
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="px-3 py-2">
                  <BaseButton size="sm" :disabled="busyKey !== null"
                    @click="run(`unpub-${g.id}`, () => contentClient.adminUnpublish(g.id), reloadWorks)">下架</BaseButton>
                  <BaseButton v-if="expanded === g.id && versionOf[g.id]" size="sm" class="ml-2" :disabled="busyKey !== null"
                    @click="run(`revoke-${g.id}`, () => contentClient.adminSetRevoked(g.id, versionOf[g.id]!, true))">吊销密钥</BaseButton>
                  <BaseButton v-if="expanded === g.id && versionOf[g.id]" size="sm" class="ml-2" :disabled="busyKey !== null"
                    @click="run(`restore-${g.id}`, () => contentClient.adminSetRevoked(g.id, versionOf[g.id]!, false))">恢复密钥</BaseButton>
                </td>
              </tr>
              <tr v-if="expanded === g.id && featuresOf[g.id]" :data-testid="`work-detail-${g.id}`">
                <td colspan="4" class="border-b-[1.5px] border-ink bg-paper px-3 py-3">
                  <div class="space-y-2">
                    <p class="font-mono text-[0.6875rem] tracking-[0.05em]">运行权限（仅对站内运行作品生效；保存后该作品的 CSP 立即按新开关放行）</p>
                    <BaseCheckbox v-for="item in FEATURE_ITEMS" :key="item.key"
                      v-model="featuresOf[g.id][item.key]" :data-testid="`admin-feature-${g.id}-${item.key}`">
                      <span class="font-bold">{{ item.label }}</span><span class="ml-1 text-xs text-ink-soft">{{ item.hint }}</span>
                    </BaseCheckbox>
                    <BaseButton size="sm" data-testid="admin-feature-save"
                      :disabled="busyKey !== null" @click="saveFeatures(g.id)">保存权限</BaseButton>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </StatePanel>

      <section>
        <h2 class="font-display text-sm font-black">已通过提交（含已下架作品，可恢复上架 / 操作历史版本）</h2>
        <StatePanel variant="lines" class="mt-3" :loading="historyLoading" :error="panelError(historyError)" @retry="reloadHistory">
          <table class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
            <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
              <tr><th class="px-3 py-2 text-left">作品</th><th class="px-3 py-2 text-left">版本</th><th class="px-3 py-2 text-left">通过时间</th><th class="px-3 py-2 text-left">操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in historySubs" :key="s.id" class="border-b-[1.5px] border-ink">
                <td class="px-3 py-2"><span class="font-bold">{{ nameOf(s) }}</span><span class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ s.work_id }}</span></td>
                <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ versionOfSub(s) }}</td>
                <td class="px-3 py-2 font-mono text-[0.625rem]">{{ s.updated_at.slice(0, 10) }}</td>
                <td class="px-3 py-2">
                  <BaseButton size="sm" :disabled="busyKey !== null"
                    @click="run(`repub-${s.work_id}`, () => contentClient.adminRepublish(s.work_id), () => { reloadWorks(); reloadHistory() })">恢复上架</BaseButton>
                  <BaseButton v-if="s.payload?.version" size="sm" class="ml-2" :disabled="busyKey !== null"
                    @click="run(`hrev-${s.work_id}-${s.payload.version}`, () => contentClient.adminSetRevoked(s.work_id, s.payload.version!, true))">吊销密钥</BaseButton>
                  <BaseButton v-if="s.payload?.version" size="sm" class="ml-2" :disabled="busyKey !== null"
                    @click="run(`hres-${s.work_id}-${s.payload.version}`, () => contentClient.adminSetRevoked(s.work_id, s.payload.version!, false))">恢复密钥</BaseButton>
                </td>
              </tr>
            </tbody>
          </table>
          <BasePagination v-model:offset="worksOffset" class="mt-3" :limit="LIMIT" :total="historyTotal" />
        </StatePanel>
      </section>
    </div>
  </section>
</template>
