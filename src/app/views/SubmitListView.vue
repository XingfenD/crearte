<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import StatePanel from '@/components/StatePanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAsync } from '@/composables/useAsync'
import { contentClient, toContentMessage, type SubmissionView } from '@/content'

const KIND_LABELS: Record<string, string> = {
  new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新'
}
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', pending: '审核中', approved: '已通过', rejected: '已拒绝'
}
const STATUS_CLASS: Record<string, string> = {
  draft: 'border-ink bg-surface',
  pending: 'border-ink bg-highlight',
  approved: 'border-ink bg-accent-ink text-paper',
  rejected: 'border-ink bg-accent-ink text-paper'
}

const { data, error, loading, reload } = useAsync<SubmissionView[]>(() => contentClient.listMine(), [])
const submissions = computed(() => data.value ?? [])

const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)
// 危险操作两步确认：记录待确认的 (id, 动作)
const confirm = ref<{ id: string; action: 'withdraw' | 'delete' } | null>(null)

// StatePanel 直出 error.message（后端原文，如 "admin role required"），过一遍 toContentMessage
// 与 actionError / AdminView.panelError 保持一致的中文映射。不动 StatePanel/useAsync 冻结面
function panelError(e: Error | null): Error | null {
  return e ? new Error(toContentMessage(e)) : null
}

function nameOf(s: SubmissionView): string {
  return s.payload?.name?.trim() || s.work_id
}

// updated_at 是 RFC3339 UTC 时间戳，直接 slice(0,10) 会在本地跨日时偏移一天，故走本地化格式化
function updatedOn(s: SubmissionView): string {
  const at = new Date(s.updated_at)
  return Number.isNaN(at.getTime()) ? s.updated_at : at.toLocaleDateString('zh-CN')
}

async function run(id: string, fn: () => Promise<unknown>): Promise<void> {
  if (busyId.value) return
  busyId.value = id
  actionError.value = null
  try {
    await fn()
    reload()
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busyId.value = null
    confirm.value = null
  }
}

// 列表页「提交」：PUT 需全量字段——先取详情原样回传 + submit:true（重复 upload_id 后端不重查）
function submitNow(s: SubmissionView): void {
  void run(s.id, async () => {
    const full = await contentClient.getSubmission(s.id)
    await contentClient.updateSubmission(full.id, {
      payload: full.payload,
      bundle_upload_id: full.bundle_upload_id ?? '',
      cover_upload_id: full.cover_upload_id ?? '',
      submit: true
    })
  })
}

function askConfirm(s: SubmissionView, action: 'withdraw' | 'delete'): void {
  confirm.value = { id: s.id, action }
}

function doConfirm(s: SubmissionView): void {
  void run(s.id, () => contentClient.deleteSubmission(s.id))
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <div class="flex items-center justify-between gap-4">
      <h1 class="font-display text-[1.75rem] font-black leading-tight">我的提交</h1>
      <RouterLink to="/submit/new" class="btn-ink lift shrink-0 hover:shadow-hard active:shadow-none">新建提交</RouterLink>
    </div>

    <p v-if="actionError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

    <div class="mt-6">
      <StatePanel :loading="loading" :error="panelError(error)" @retry="reload">
        <p v-if="submissions.length === 0" class="border-2 border-ink bg-surface p-6 text-sm text-ink-soft shadow-hard">
          还没有提交。把你的作品分享给所有人——
          <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/submit/new">提交第一个作品</RouterLink>
        </p>
        <ul v-else class="space-y-4">
          <li
            v-for="s in submissions"
            :key="s.id"
            :data-testid="`submission-${s.id}`"
            class="border-2 border-ink bg-surface p-4 shadow-hard"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-sm font-black">{{ nameOf(s) }}</h2>
              <span class="border-[1.5px] border-ink px-1 py-0.5 font-mono text-[0.625rem]">{{ KIND_LABELS[s.kind] ?? s.kind }}</span>
              <span :class="['border-[1.5px] px-1.5 py-0.5 font-mono text-[0.625rem] font-bold', STATUS_CLASS[s.status] ?? 'border-ink bg-surface']">
                {{ STATUS_LABELS[s.status] ?? s.status }}
              </span>
              <span class="ml-auto font-mono text-[0.625rem] text-ink-soft">{{ s.work_id }}</span>
            </div>

            <p v-if="s.status === 'rejected' && s.review_note" class="mt-3 border-2 border-ink bg-paper px-3 py-2 text-xs">
              <span class="font-mono font-bold">审核意见：</span>{{ s.review_note }}
            </p>
            <RouterLink
              v-if="s.status === 'approved'"
              :to="`/games/${s.work_id}`"
              class="mt-2 inline-block text-xs text-accent-ink underline decoration-2 underline-offset-2"
            >查看已发布作品 →</RouterLink>

            <p class="mt-2 font-mono text-[0.625rem] text-ink-soft">更新于 {{ updatedOn(s) }}</p>

            <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <RouterLink
                v-if="s.status === 'draft' || s.status === 'rejected'"
                :to="`/submit/${s.id}`"
                class="border-2 border-ink bg-surface px-2 py-1 hover:bg-paper"
              >编辑</RouterLink>
              <BaseButton
                v-if="s.status === 'draft' || s.status === 'rejected'"
                size="sm"
                class="bg-highlight"
                :disabled="busyId === s.id"
                @click="submitNow(s)"
              >{{ busyId === s.id ? '处理中…' : (s.status === 'rejected' ? '重新提交' : '提交') }}</BaseButton>
              <BaseButton
                v-if="s.status === 'pending'"
                size="sm"
                :disabled="busyId === s.id"
                @click="askConfirm(s, 'withdraw')"
              >撤回</BaseButton>
              <BaseButton
                v-if="s.status === 'draft'"
                size="sm"
                :disabled="busyId === s.id"
                @click="askConfirm(s, 'delete')"
              >删除</BaseButton>
            </div>

            <div v-if="confirm?.id === s.id" class="mt-3 border-2 border-ink bg-paper p-3 text-xs">
              <p class="font-bold">
                {{ confirm.action === 'withdraw' ? '撤回后提交将被删除（已上传文件由服务端清理），需重新创建。确认撤回？' : '删除后不可恢复。确认删除？' }}
              </p>
              <div class="mt-2 flex gap-2 font-bold">
                <BaseButton size="sm" class="bg-accent-ink text-paper" :disabled="busyId === s.id" @click="doConfirm(s)">
                  {{ busyId === s.id ? '处理中…' : '确认' }}
                </BaseButton>
                <BaseButton size="sm" @click="confirm = null">取消</BaseButton>
              </div>
            </div>
          </li>
        </ul>
      </StatePanel>
    </div>
  </section>
</template>
