<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import { contentClient, toContentMessage, type SubmissionView } from '@/content'
import { FEATURE_ITEMS, hasAnyFeature } from '@/content/features'
import { GAME_TYPE_LABELS } from '@/lib/labels'

const props = defineProps<{ id?: string }>()
const route = useRoute()
const router = useRouter()
const submissionId = computed(() => props.id ?? String(route.params.id ?? ''))

const sub = ref<SubmissionView | null>(null)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const busy = ref<'load' | 'approve' | 'reject' | null>(null)
const rejectMode = ref(false)
const rejectNote = ref('')

const KIND_LABELS: Record<string, string> = { new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新' }
const STATUS_LABELS: Record<string, string> = { draft: '草稿', pending: '审核中', approved: '已通过', rejected: '已拒绝' }
// P6 D-D：hosted 提交的降级方式展示（审核人据此判断嵌播失败后的行为）；文案对齐表单选项去掉建议后缀
const FALLBACK_LABELS: Record<string, string> = { external: '降级为外链', hosted: '降级为站内播放', none: '不降级' }
const hostedFallbackText = computed(() => {
  const fb = sub.value?.payload?.fallback
  return fb ? FALLBACK_LABELS[fb] ?? fb : '—'
})
const isPending = computed(() => sub.value?.status === 'pending')
const canReject = computed(() => rejectNote.value.trim().length > 0)
// 提交者申请的运行权限（只读）：admin 需要据此判断是否放行；调整走作品管理或驳回
const featuresText = computed(() => {
  const f = sub.value?.payload?.features
  if (!hasAnyFeature(f)) return '—（未声明额外权限，按默认收紧策略运行）'
  return FEATURE_ITEMS.filter((i) => f?.[i.key]).map((i) => i.label).join('、')
})

async function load(): Promise<void> {
  busy.value = 'load'
  loadError.value = null
  try {
    sub.value = await contentClient.getSubmission(submissionId.value)
  } catch (e) {
    loadError.value = toContentMessage(e)
  } finally {
    busy.value = null
  }
}
void load()

async function approve(): Promise<void> {
  if (busy.value) return
  if (!window.confirm('确认通过？将执行发布投影：bundle 转正式存储、目录立即可见、密钥开始签发。发布后可下架，但不会静默撤销。')) return
  busy.value = 'approve'
  actionError.value = null
  try {
    await contentClient.adminApprove(submissionId.value)
    await router.push('/admin')
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busy.value = null
  }
}

async function reject(): Promise<void> {
  if (busy.value || !canReject.value) return
  busy.value = 'reject'
  actionError.value = null
  try {
    await contentClient.adminReject(submissionId.value, rejectNote.value.trim())
    await router.push('/admin')
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <p class="font-mono text-[0.6875rem]"><RouterLink class="underline decoration-2 underline-offset-2" to="/admin">← 返回队列</RouterLink></p>
    <h1 class="mt-2 font-display text-[1.75rem] font-black leading-tight">审核详情</h1>

    <p v-if="loadError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ loadError }}</p>
    <p v-if="busy === 'load'" class="mt-4 text-sm text-ink-soft" aria-busy="true">加载中…</p>

    <template v-if="sub">
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <span class="border-2 border-ink bg-surface px-2 py-0.5 font-mono text-[0.6875rem] font-bold">{{ KIND_LABELS[sub.kind] ?? sub.kind }}</span>
        <span class="border-2 border-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold"
          :class="sub.status === 'pending' ? 'bg-highlight' : sub.status === 'approved' || sub.status === 'rejected' ? 'bg-accent-ink text-paper' : 'bg-surface'">
          {{ STATUS_LABELS[sub.status] ?? sub.status }}
        </span>
        <span class="font-mono text-[0.625rem] text-ink-soft">{{ sub.id }}</span>
      </div>
      <p v-if="sub.review_note" class="mt-3 border-2 border-ink bg-paper px-3 py-2 text-xs"><span class="font-mono font-bold">审核意见：</span>{{ sub.review_note }}</p>

      <dl class="mt-6 space-y-2 border-2 border-ink bg-surface p-4 text-sm shadow-hard">
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">work_id</dt><dd data-testid="payload-id" class="font-bold">{{ sub.work_id }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">名称</dt><dd data-testid="payload-name">{{ sub.payload?.name }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">原始链接</dt><dd><a v-if="sub.payload?.url" :href="sub.payload.url" target="_blank" rel="noopener noreferrer" class="text-accent-ink underline decoration-2 underline-offset-2">{{ sub.payload.url }}</a></dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">作者</dt><dd>{{ sub.payload?.author?.name }}<span v-if="sub.payload?.author?.url" class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ sub.payload.author.url }}</span></dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">描述</dt><dd>{{ sub.payload?.description }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">时长</dt><dd>{{ sub.payload?.durationMinutes?.min }}–{{ sub.payload?.durationMinutes?.max }} 分钟</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">类型 / 标签</dt><dd>{{ GAME_TYPE_LABELS[sub.payload?.type ?? 'other'] ?? sub.payload?.type }} · {{ (sub.payload?.tags ?? []).join('、') || '—' }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">运行时 / 版本</dt><dd>{{ sub.payload?.runtime ?? 'external' }}<span v-if="sub.payload?.version"> · {{ sub.payload.version }}</span><span v-if="sub.payload?.entry"> · 入口 {{ sub.payload.entry }}</span></dd></div>
        <!-- D-D（P6 spec）：hosted 提交展示托管链接——纯文本不渲染锚点/预览，审核者不被引导点击任意第三方 URL -->
        <div v-if="sub.payload?.hostedUrl" class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">托管链接</dt><dd data-testid="payload-hosted-url" class="font-mono text-[0.6875rem]">{{ sub.payload.hostedUrl }}</dd></div>
        <div v-if="sub.payload?.runtime === 'hosted'" class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">降级方式</dt><dd data-testid="payload-hosted-fallback" class="font-mono text-[0.6875rem]">{{ hostedFallbackText }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">运行权限</dt><dd data-testid="payload-features" class="font-mono text-[0.6875rem]">{{ featuresText }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">bundle</dt><dd data-testid="payload-bundle" class="font-mono text-[0.6875rem]">{{ sub.bundle_upload_id ? `已关联上传 ${sub.bundle_upload_id.slice(0, 8)}…（密文，审批通过后可见）` : '—' }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">封面</dt><dd class="font-mono text-[0.6875rem]">{{ sub.cover_upload_id ? '已关联上传（审批通过后可见）' : '—' }}</dd></div>
        <div v-if="sub.payload?.intro" class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">简介</dt><dd class="whitespace-pre-wrap text-xs">{{ sub.payload.intro }}</dd></div>
      </dl>

      <p v-if="actionError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

      <div v-if="isPending" class="mt-6 space-y-3">
        <div class="flex gap-3">
          <BaseButton variant="ink" lift class="bg-highlight" :disabled="busy !== null" @click="approve">
            {{ busy === 'approve' ? '处理中…' : '通过' }}
          </BaseButton>
          <BaseButton variant="ink" lift :disabled="busy !== null" @click="rejectMode = !rejectMode">
            拒绝
          </BaseButton>
        </div>
        <div v-if="rejectMode" class="border-2 border-ink bg-surface p-3">
          <label class="font-mono text-[0.6875rem]" for="reject-note">审核意见（必填，将展示给提交者）</label>
          <textarea id="reject-note" v-model="rejectNote" data-testid="reject-note" rows="3" class="mt-1 w-full border-2 border-ink bg-paper px-3 py-2 text-sm" />
          <BaseButton variant="ink" lift class="mt-2 bg-accent-ink text-paper" :disabled="!canReject || busy !== null" @click="reject">
            {{ busy === 'reject' ? '处理中…' : '确认拒绝' }}
          </BaseButton>
        </div>
      </div>
    </template>
  </section>
</template>
