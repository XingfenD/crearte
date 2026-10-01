<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import StatePanel from '@/components/StatePanel.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useAsync } from '@/composables/useAsync'
import { apiRepo } from '@/data'
import type { AuditEntry } from '@/data/types'
import { toContentMessage } from '@/content'
import { AUDIT_ROUTE_OPTIONS, auditActionLabel, auditObject, auditStatusClass } from '@/lib/adminAudit'

const LIMIT = 50
// '' = 全部动作；非空 = route 模板等值过滤（服务侧 routeFilter 语义）
const routeFilter = ref('')
const offset = ref(0)

const { data, error, loading, reload } = useAsync(
  () => (apiRepo
    ? apiRepo.listAudit({ route: routeFilter.value, limit: LIMIT, offset: offset.value })
    : Promise.reject(new Error('未配置内容 API'))),
  [routeFilter, offset]
)
const entries = computed(() => data.value?.entries ?? [])
const total = computed(() => data.value?.total ?? 0)

// StatePanel 直出 error.message，与 AdminView.panelError 同构做中文映射
function panelError(e: Error | null): Error | null {
  return e ? new Error(toContentMessage(e)) : null
}

function onFilterChange(value: string): void {
  routeFilter.value = value
  offset.value = 0
}
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <div class="flex items-center justify-between gap-4">
      <h1 class="font-display text-[1.75rem] font-black leading-tight">操作日志</h1>
      <RouterLink to="/admin" class="text-xs font-bold underline decoration-2 underline-offset-2">← 返回审核</RouterLink>
    </div>

    <div class="mt-4 flex max-w-sm items-center gap-2">
      <label for="audit-route-filter" class="shrink-0 font-mono text-[0.6875rem] font-bold">动作筛选</label>
      <select
        id="audit-route-filter"
        data-testid="audit-route-filter"
        :value="routeFilter"
        class="w-full appearance-none border-2 border-ink bg-surface py-2 pl-3 pr-8 text-sm"
        @change="onFilterChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="">全部动作</option>
        <option v-for="opt in AUDIT_ROUTE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <StatePanel variant="lines" class="mt-4" :loading="loading" :error="panelError(error)" @retry="reload">
      <p v-if="entries.length === 0" class="border-2 border-ink bg-surface p-6 text-sm text-ink-soft shadow-hard">该条件下没有审计记录。</p>
      <table v-else class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
        <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
          <tr>
            <th scope="col" class="px-3 py-2 text-left">时间</th>
            <th scope="col" class="px-3 py-2 text-left">操作者</th>
            <th scope="col" class="px-3 py-2 text-left">动作</th>
            <th scope="col" class="px-3 py-2 text-left">对象</th>
            <th scope="col" class="px-3 py-2 text-left">结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id" :data-testid="`audit-row-${e.id}`" class="border-b-[1.5px] border-ink">
            <td class="px-3 py-2 font-mono text-[0.625rem]">{{ new Date(e.created_at).toLocaleString('zh-CN') }}</td>
            <td class="px-3 py-2 font-mono text-[0.625rem]">{{ e.actor_email }}</td>
            <td class="px-3 py-2 text-xs font-bold">{{ auditActionLabel(e.method, e.route) }}</td>
            <td class="px-3 py-2 font-mono text-[0.625rem]">{{ auditObject(e.route, e.path) }}</td>
            <td class="px-3 py-2">
              <span :data-testid="`audit-status-${e.id}`" class="border-[1.5px] px-1.5 py-0.5 font-mono text-[0.625rem] font-bold"
                :class="auditStatusClass(e.status)">{{ e.status }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <BasePagination v-model:offset="offset" class="mt-3" :limit="LIMIT" :total="total" />
    </StatePanel>
  </section>
</template>
