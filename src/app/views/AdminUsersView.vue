<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import StatePanel from '@/components/StatePanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useAsync } from '@/composables/useAsync'
import { apiRepo } from '@/data'
// AdminApiError 从 repository 拿（测试只 mock '@/data' 聚合层，此类保持真身，instanceof 可判）
import { AdminApiError } from '@/data/repository'
import type { AdminUser, AdminUserRole } from '@/data/types'
import { toContentMessage } from '@/content'

const LIMIT = 50
const DEBOUNCE_MS = 300
const ROLE_LABELS: Record<AdminUserRole, string> = { admin: '管理员', user: '用户' }

const query = ref('')
const debouncedQuery = ref('')
const offset = ref(0)
const actionError = ref<string | null>(null)
const busyId = ref<string | null>(null)
// 降级两步确认：非 null 时该行展开确认弹层（危险操作样式对齐 SubmitListView）
const demoteTarget = ref<AdminUser | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(query, (next) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = next.trim()
    offset.value = 0
  }, DEBOUNCE_MS)
})
onBeforeUnmount(() => { if (debounceTimer) clearTimeout(debounceTimer) })

const { data, error, loading, reload } = useAsync(
  () => (apiRepo
    ? apiRepo.listAdminUsers({ q: debouncedQuery.value, limit: LIMIT, offset: offset.value })
    : Promise.reject(new Error('未配置内容 API'))),
  [debouncedQuery, offset]
)
const users = computed(() => data.value?.users ?? [])
const total = computed(() => data.value?.total ?? 0)

// StatePanel 直出 error.message，与 AdminView.panelError 同构做中文映射
function panelError(e: Error | null): Error | null {
  return e ? new Error(toContentMessage(e)) : null
}

function toggleDemoteConfirm(user: AdminUser): void {
  demoteTarget.value = demoteTarget.value?.id === user.id ? null : user
}

async function setUserRole(user: AdminUser, role: AdminUserRole): Promise<void> {
  if (!apiRepo || busyId.value) return
  busyId.value = user.id
  actionError.value = null
  try {
    await apiRepo.setUserRole(user.id, role)
    demoteTarget.value = null
    reload()
  } catch (e) {
    // 409 last_admin：后端原文（cannot demote the last admin）必须直接回显，
    // AdminApiError 的 message 即后端 error.message，走 Error 分支透出，不套中文映射
    actionError.value = e instanceof AdminApiError ? e.message : toContentMessage(e)
    demoteTarget.value = null
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <div class="flex items-center justify-between gap-4">
      <h1 class="font-display text-[1.75rem] font-black leading-tight">用户管理</h1>
      <RouterLink to="/admin" class="text-xs font-bold underline decoration-2 underline-offset-2">← 返回审核</RouterLink>
    </div>

    <form class="mt-4 flex gap-2" @submit.prevent="">
      <label for="user-search" class="sr-only">搜索用户（邮箱或用户名）</label>
      <input
        id="user-search"
        v-model="query"
        data-testid="user-search"
        type="search"
        placeholder="搜索邮箱或用户名…"
        class="w-full max-w-sm appearance-none border-2 border-ink bg-surface px-3 py-2 text-sm shadow-hard-sm"
      >
    </form>

    <p v-if="actionError" role="alert" data-testid="users-action-error" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

    <StatePanel class="mt-4" :loading="loading" :error="panelError(error)" @retry="reload">
      <p v-if="users.length === 0" class="border-2 border-ink bg-surface p-6 text-sm text-ink-soft shadow-hard">没有匹配的用户。</p>
      <table v-else class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
        <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
          <tr>
            <th class="px-3 py-2 text-left">用户名</th>
            <th class="px-3 py-2 text-left">邮箱</th>
            <th class="px-3 py-2 text-left">显示名</th>
            <th class="px-3 py-2 text-left">角色</th>
            <th class="px-3 py-2 text-left">注册时间</th>
            <th class="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          <template v-for="u in users" :key="u.id">
            <tr :data-testid="`user-row-${u.id}`" class="border-b-[1.5px] border-ink">
              <td class="px-3 py-2 font-bold">{{ u.username }}</td>
              <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ u.email }}</td>
              <td class="px-3 py-2">{{ u.display_name || '—' }}</td>
              <td class="px-3 py-2">
                <span class="border-[1.5px] border-ink px-1.5 py-0.5 font-mono text-[0.625rem] font-bold"
                  :class="u.role === 'admin' ? 'bg-accent-ink text-paper' : 'bg-surface'">{{ ROLE_LABELS[u.role] ?? u.role }}</span>
              </td>
              <td class="px-3 py-2 font-mono text-[0.625rem]">{{ new Date(u.created_at).toLocaleString('zh-CN') }}</td>
              <td class="px-3 py-2 text-right">
                <BaseButton v-if="u.role === 'user'" size="sm" :disabled="busyId !== null"
                  @click="setUserRole(u, 'admin')">升为 admin</BaseButton>
                <BaseButton v-else size="sm" class="bg-accent-ink text-paper" :disabled="busyId !== null"
                  @click="toggleDemoteConfirm(u)">降为 user</BaseButton>
              </td>
            </tr>
            <!-- 降级确认弹层：两个必含要点（登录态失效 / 最后一个 admin 会被 409 拒绝） -->
            <tr v-if="demoteTarget?.id === u.id" data-testid="demote-confirm">
              <td colspan="6" class="border-b-[1.5px] border-ink bg-paper px-3 py-3">
                <p class="text-xs font-bold">确认将 {{ u.username }}（{{ u.email }}）降为普通用户？</p>
                <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
                  <li data-testid="demote-note-sessions">降级后对方的所有登录态立即失效，需重新登录。</li>
                  <li data-testid="demote-note-last-admin">若其为最后一个管理员，本次降级将被拒绝（409）。</li>
                </ul>
                <div class="mt-2 flex gap-2">
                  <BaseButton size="sm" class="bg-accent-ink text-paper" :disabled="busyId !== null"
                    @click="setUserRole(u, 'user')">{{ busyId === u.id ? '处理中…' : '确认降级' }}</BaseButton>
                  <BaseButton size="sm" @click="demoteTarget = null">取消</BaseButton>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <BasePagination v-model:offset="offset" class="mt-3" :limit="LIMIT" :total="total" />
    </StatePanel>
  </section>
</template>
