<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import FileInput from '@/components/ui/FileInput.vue'
import { contentClient, toContentMessage, validateUploadInput } from '@/content'
import { EMPTY_FEATURES, FEATURE_ITEMS, collectFeatures, featuresToForm } from '@/content/features'
import { parseTags, slugify, validateWorkPayload, VERSION_PATTERN, WORK_ID_PATTERN, type FieldKey } from '@/content/validation'
import type { SubmissionKind, SubmissionView, UploadResult, WorkPayload } from '@/content/types'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS } from '@/lib/labels'
// 预填走 apiRepo 直连（spec:126「apiRepo 直连，不走 merge」）：白得 ETag 缓存 / in-flight 去重 /
// assertGameDetail 形状校验，且 404 抛 NotFoundError —— 与 GameView.vue:5,22 的既有惯例一致。
// ⚠️ 绝不可改用 contentClient：Task 4 审查已删除 gameDetail（e744794），且 content 层的 404 抛
// ContentApiError，会让下面 catch 里的 NotFoundError 分支变成永不命中的死代码
import { apiRepo, NotFoundError } from '@/data'

const props = defineProps<{ id?: string }>()
const route = useRoute()
const router = useRouter()
const submissionId = computed(() => props.id ?? (route.params.id as string | undefined))

const kind = ref<SubmissionKind>('new_work')
const form = reactive({
  workId: '', name: '', url: '', authorName: '', authorUrl: '',
  description: '', durationMin: '5', durationMax: '20', type: 'puzzle',
  tagsText: '', intro: '', runtime: 'external' as 'external' | 'virtual',
  version: '', entry: 'index.html',
  features: { ...EMPTY_FEATURES }
})

const existing = ref<SubmissionView | null>(null)
const readOnly = computed(() => existing.value !== null && (existing.value.status === 'pending' || existing.value.status === 'approved'))
const editing = computed(() => submissionId.value !== undefined)

const bundle = ref<UploadResult | null>(null)
const bundleLinkedOnly = ref(false) // 编辑模式仅有 upload_id（无 sha/bytes 元信息）
// spec:132 AAD 绑定：work_id/version 改过后已传 bundle 作废。必须单独记账，因为 save() 的
// `?? existing.bundle_upload_id` 回退会把作废 id 复活（后端 Update 只在 freshBundle 时复检 AAD）
const bundleInvalidated = ref(false)
const cover = ref<UploadResult | null>(null)
const coverLinkedOnly = ref(false)
const coverPreview = ref<string | null>(null)
const progress = ref<{ which: 'bundle' | 'cover'; received: number; total: number } | null>(null)

const error = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<FieldKey, string>>>({})
const showErrors = ref(false)
const busy = ref<'draft' | 'submit' | 'load' | null>(null)
const slugTouched = ref(false)
const notice = ref<string | null>(null) // 「请重新上传 bundle」等非错误提示

onBeforeUnmount(() => {
  if (prefillTimer) clearTimeout(prefillTimer)
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
})

const KIND_LABELS: Record<SubmissionKind, string> = { new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新' }

function buildPayload(): WorkPayload {
  return {
    id: form.workId.trim(),
    name: form.name.trim(),
    url: form.url.trim(),
    author: { name: form.authorName.trim(), ...(form.authorUrl.trim() ? { url: form.authorUrl.trim() } : {}) },
    description: form.description.trim(),
    durationMinutes: { min: Number(form.durationMin), max: Number(form.durationMax) },
    type: form.type as WorkPayload['type'],
    tags: parseTags(form.tagsText),
    ...(form.intro.trim() ? { intro: form.intro.trim() } : {}),
    // features 仅对 virtual 有意义（SW 按作品 features 注入 CSP）；两个键总是输出，
    // 显式空对象 = 不放宽——后端据此把「缺键（旧提交）」与「显式清空」区分开
    ...(form.runtime === 'virtual' ? { runtime: 'virtual' as const, version: form.version.trim(), entry: form.entry.trim() || 'index.html', features: collectFeatures(form.features) } : {})
  }
}

// 新建 new_work：名称 → slug 自动生成（手动改过 work id 后停止覆盖）
watch(() => form.name, (name) => {
  if (!editing.value && kind.value === 'new_work' && !slugTouched.value) form.workId = slugify(name)
})
watch(() => form.workId, (_v, old) => { if (old !== undefined && _v !== slugify(form.name)) slugTouched.value = true }, { flush: 'post' })

// AAD 绑定 work_id/version：任一变化即作废已传 bundle。
// suppressAadWatch：编辑模式回填字段时不触发（回填≠用户修改）
let suppressAadWatch = false
watch([() => form.workId, () => form.version], () => {
  if (suppressAadWatch) return
  if (bundle.value || bundleLinkedOnly.value) {
    bundle.value = null
    bundleLinkedOnly.value = false
    bundleInvalidated.value = true
    notice.value = '作品 id 或版本号已修改，请重新上传 bundle'
  }
})

const bundleDisabled = computed(() =>
  form.runtime !== 'virtual' || kind.value === 'metadata_change' ||
  !WORK_ID_PATTERN.test(form.workId.trim()) || !VERSION_PATTERN.test(form.version.trim()) ||
  readOnly.value || busy.value !== null
)

// 精确提示缺哪个字段：占位符（如版本号 v1）容易被误认为已填写
const bundleDisabledHint = computed(() => {
  if (!bundleDisabled.value || kind.value === 'metadata_change') return ''
  const missing: string[] = []
  if (!WORK_ID_PATTERN.test(form.workId.trim())) missing.push('作品 id')
  if (!VERSION_PATTERN.test(form.version.trim())) missing.push('版本号')
  return missing.length > 0 ? `先填写${missing.join(' 与 ')}后可上传` : ''
})

// new_version / metadata_change 预填
let prefillTimer: ReturnType<typeof setTimeout> | null = null
watch([() => form.workId, kind], () => {
  if (editing.value || (kind.value !== 'new_version' && kind.value !== 'metadata_change')) return
  if (!WORK_ID_PATTERN.test(form.workId.trim())) return
  if (prefillTimer) clearTimeout(prefillTimer)
  prefillTimer = setTimeout(() => void prefill(form.workId.trim()), 600)
})

// 切 kind 后重置 slug 锁定：new_work 手改过 workId 再切走又切回，应恢复名称→slug 自动联动
watch(kind, () => { slugTouched.value = false })

async function prefill(workId: string): Promise<void> {
  error.value = null
  try {
    // apiRepo 在 authEnabled 为真时必非 null（submit 路由受 requiresAuth 守卫，见 Task 5），
    // 此守卫只为满足 TS 的 `ApiContentRepository | null` 类型，实际不可达
    if (!apiRepo) throw new Error('内容 API 未启用')
    const game = await apiRepo.getGame(workId)
    // hosted 在本表单无法表达（form.runtime 与 content 层 WorkPayload.runtime 均只有 external|virtual）：
    // 若归一成 external 提交，后端 UpdateMetadata 全列覆盖会把 hosted 作品静默降级 → 直接拒绝预填
    if (game.runtime === 'hosted') {
      error.value = '该作品为 hosted 运行时，暂不支持在此提交（仅外链与站内作品可）'
      return
    }
    form.name = game.name
    form.url = game.url
    form.authorName = game.author.name
    form.authorUrl = game.author.url ?? ''
    form.description = game.description
    form.durationMin = String(game.durationMinutes.min)
    form.durationMax = String(game.durationMinutes.max)
    form.type = game.type
    form.tagsText = game.tags.join(', ')
    form.intro = game.intro ?? ''
    form.runtime = game.runtime === 'virtual' ? 'virtual' : 'external'
    form.entry = game.entry ?? 'index.html'
    form.features = featuresToForm(game.features)
    // new_version 必须提供新版本号：预填后清空强制用户输入
    form.version = kind.value === 'new_version' ? '' : (game.version ?? '')
    if (kind.value === 'new_version' && game.runtime !== 'virtual') {
      error.value = '该作品不是 virtual 运行时，不能提交新版本'
    }
  } catch (e) {
    error.value = e instanceof NotFoundError ? '作品不存在' : toContentMessage(e)
  }
}

// 编辑模式加载
watch(submissionId, (id) => { if (id) void loadExisting(id) }, { immediate: true })

async function loadExisting(id: string): Promise<void> {
  busy.value = 'load'
  error.value = null
  suppressAadWatch = true
  try {
    const s = await contentClient.getSubmission(id)
    existing.value = s
    kind.value = s.kind
    const p = s.payload
    form.workId = p.id ?? s.work_id
    form.name = p.name ?? ''
    form.url = p.url ?? ''
    form.authorName = p.author?.name ?? ''
    form.authorUrl = p.author?.url ?? ''
    form.description = p.description ?? ''
    form.durationMin = String(p.durationMinutes?.min ?? 5)
    form.durationMax = String(p.durationMinutes?.max ?? 20)
    form.type = p.type ?? 'puzzle'
    form.tagsText = (p.tags ?? []).join(', ')
    form.intro = p.intro ?? ''
    form.runtime = p.runtime === 'virtual' ? 'virtual' : 'external'
    form.version = p.version ?? ''
    form.entry = p.entry ?? 'index.html'
    form.features = featuresToForm(p.features)
    bundleLinkedOnly.value = Boolean(s.bundle_upload_id)
    bundleInvalidated.value = false
    coverLinkedOnly.value = Boolean(s.cover_upload_id)
    await nextTick() // 等 watcher 队列冲完回填触发的回调
  } catch (e) {
    error.value = toContentMessage(e)
  } finally {
    suppressAadWatch = false
    busy.value = null
  }
}

async function onBundleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  const invalid = validateUploadInput({ kind: 'bundle', workId: form.workId.trim(), version: form.version.trim(), file })
  if (invalid) { error.value = invalid; return }
  error.value = null
  notice.value = null
  busy.value = 'draft'
  try {
    bundle.value = await contentClient.upload(
      { kind: 'bundle', workId: form.workId.trim(), version: form.version.trim(), file },
      (p) => { progress.value = { which: 'bundle', ...p } }
    )
    bundleLinkedOnly.value = false
    bundleInvalidated.value = false
  } catch (e) {
    error.value = toContentMessage(e)
  } finally {
    progress.value = null
    busy.value = null
  }
}

async function onCoverFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  const invalid = validateUploadInput({ kind: 'cover', file })
  if (invalid) { error.value = invalid; return }
  error.value = null
  busy.value = 'draft'
  try {
    cover.value = await contentClient.upload({ kind: 'cover', file }, (p) => { progress.value = { which: 'cover', ...p } })
    coverLinkedOnly.value = false
    if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
    coverPreview.value = URL.createObjectURL(file)
  } catch (e) {
    error.value = toContentMessage(e)
  } finally {
    progress.value = null
    busy.value = null
  }
}

async function save(submit: boolean): Promise<void> {
  if (busy.value || readOnly.value) return
  error.value = null
  notice.value = null
  const payload = buildPayload()
  const errors = validateWorkPayload(payload, kind.value)
  fieldErrors.value = errors
  showErrors.value = true
  if (Object.keys(errors).length > 0) return
  // spec:132 硬拦截：bundle 已因 work_id/version 变更作废且未重传时，绝不能保存。
  // 若放行，下面的 `?? existing.value.bundle_upload_id` 会把作废 id 原样回传，而后端 Update
  // 仅对「与已存值不同」的 upload_id 复检 AAD（content.go:373-375 freshBundle），发空串也会
  // 被 `bundleRef := env.BundleUploadID` 回退 —— 两条路都会把 AAD 绑旧 version 的 bundle
  // 静默写回，发布后玩家侧解密失败。
  if (bundleInvalidated.value && !bundle.value) {
    error.value = '作品 id 或版本号已修改，原 bundle 已失效，请重新上传后再保存'
    return
  }
  if (submit && !window.confirm('确认提交审核？审核通过后作品将公开可见。')) return
  busy.value = submit ? 'submit' : 'draft'
  try {
    if (existing.value) {
      await contentClient.updateSubmission(existing.value.id, {
        payload,
        bundle_upload_id: bundle.value?.upload_id ?? existing.value.bundle_upload_id ?? '',
        cover_upload_id: cover.value?.upload_id ?? existing.value.cover_upload_id ?? '',
        submit
      })
    } else {
      await contentClient.createSubmission({
        kind: kind.value,
        work_id: payload.id,
        payload,
        bundle_upload_id: bundle.value?.upload_id ?? '',
        cover_upload_id: cover.value?.upload_id ?? '',
        submit
      })
    }
    await router.push('/submit')
  } catch (e) {
    error.value = toContentMessage(e)
    showErrors.value = false
  } finally {
    busy.value = null
  }
}

function err(key: FieldKey): string | undefined {
  return showErrors.value ? fieldErrors.value[key] : undefined
}
const labelClass = 'font-mono text-[0.6875rem] tracking-[0.05em]'
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">
      {{ editing ? (readOnly ? '提交详情' : '编辑提交') : '提交作品' }}
    </h1>

    <p
      v-if="existing && (existing.status !== 'draft' && existing.status !== 'rejected')"
      class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold"
    >当前状态「{{ existing.status === 'pending' ? '审核中' : '已通过' }}」，不可编辑。</p>
    <p v-if="notice" class="mt-4 border-2 border-ink bg-paper px-3 py-2 text-xs font-bold">{{ notice }}</p>
    <p v-if="error" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>

    <form class="mt-6 space-y-8" novalidate @submit.prevent="save(false)">
      <!-- 1. 提交类型 -->
      <fieldset class="space-y-2" :disabled="readOnly">
        <legend :class="labelClass">提交类型</legend>
        <BaseSelect v-if="!editing" v-model="kind" data-testid="kind-select">
          <option value="new_work">{{ KIND_LABELS.new_work }}</option>
          <option value="new_version">{{ KIND_LABELS.new_version }}（已收录的 virtual 作品）</option>
          <option value="metadata_change">{{ KIND_LABELS.metadata_change }}（已收录作品）</option>
        </BaseSelect>
        <p v-else class="text-sm font-bold">{{ KIND_LABELS[kind] }}</p>
      </fieldset>

      <!-- 2. 基本信息 -->
      <fieldset class="space-y-4" :disabled="readOnly">
        <legend :class="labelClass">基本信息</legend>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-workid">作品 id（slug，收录后不可改）</label>
          <BaseInput id="sf-workid" v-model="form.workId" data-testid="work-id" type="text"
            :readonly="editing" :invalid="Boolean(err('workId'))" @blur="kind !== 'new_work' && !editing && prefill(form.workId.trim())" />
          <p v-if="err('workId')" class="text-xs font-bold text-accent-ink">{{ err('workId') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-name">名称</label>
          <BaseInput id="sf-name" v-model="form.name" type="text" :invalid="Boolean(err('name'))" />
          <p v-if="err('name')" class="text-xs font-bold text-accent-ink">{{ err('name') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-url">作品原始链接</label>
          <BaseInput id="sf-url" v-model="form.url" type="url" :invalid="Boolean(err('url'))" />
          <p v-if="err('url')" class="text-xs font-bold text-accent-ink">{{ err('url') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-author">作者名</label>
            <BaseInput id="sf-author" v-model="form.authorName" type="text" :invalid="Boolean(err('authorName'))" />
            <p v-if="err('authorName')" class="text-xs font-bold text-accent-ink">{{ err('authorName') }}</p>
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-author-url">作者链接（可选）</label>
            <BaseInput id="sf-author-url" v-model="form.authorUrl" type="url" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-desc">描述</label>
          <BaseTextarea id="sf-desc" v-model="form.description" rows="3" :aria-invalid="Boolean(err('description'))" />
          <p v-if="err('description')" class="text-xs font-bold text-accent-ink">{{ err('description') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-dur-min">最短时长（分钟）</label>
            <BaseInput id="sf-dur-min" v-model="form.durationMin" type="number" min="1" />
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-dur-max">最长时长（分钟）</label>
            <BaseInput id="sf-dur-max" v-model="form.durationMax" type="number" min="1" />
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-type">类型</label>
            <BaseSelect id="sf-type" v-model="form.type">
              <option v-for="t in GAME_TYPES" :key="t" :value="t">{{ GAME_TYPE_LABELS[t] }}</option>
            </BaseSelect>
          </div>
        </div>
        <p v-if="err('duration') || err('type')" class="text-xs font-bold text-accent-ink">{{ err('duration') ?? err('type') }}</p>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-tags">标签（逗号分隔，最多 8 个）</label>
          <BaseInput id="sf-tags" v-model="form.tagsText" type="text" :invalid="Boolean(err('tags'))" />
          <p v-if="err('tags')" class="text-xs font-bold text-accent-ink">{{ err('tags') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-intro">玩法简介（可选，支持 Markdown）</label>
          <BaseTextarea id="sf-intro" v-model="form.intro" rows="4" />
        </div>
      </fieldset>

      <!-- 3. 运行方式与文件 -->
      <fieldset class="space-y-4" :disabled="readOnly">
        <legend :class="labelClass">运行方式</legend>
        <div class="flex gap-4 text-sm font-bold">
          <label class="inline-flex items-center gap-1.5">
            <input v-model="form.runtime" type="radio" value="external" :disabled="kind !== 'new_work'"> 外链作品
          </label>
          <label class="inline-flex items-center gap-1.5">
            <input v-model="form.runtime" data-testid="runtime-virtual" type="radio" value="virtual"
              :disabled="kind !== 'new_work'"> 站内运行（上传 bundle）
          </label>
        </div>
        <template v-if="form.runtime === 'virtual'">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="font-mono text-[0.6875rem]" for="sf-version">版本号</label>
              <BaseInput id="sf-version" v-model="form.version" data-testid="version" type="text" placeholder="v1"
                :readonly="kind === 'metadata_change'" :invalid="Boolean(err('version'))" />
              <p v-if="err('version')" class="text-xs font-bold text-accent-ink">{{ err('version') }}</p>
            </div>
            <div class="space-y-1.5">
              <label class="font-mono text-[0.6875rem]" for="sf-entry">入口文件</label>
              <BaseInput id="sf-entry" v-model="form.entry" type="text" :invalid="Boolean(err('entry'))" />
              <p v-if="err('entry')" class="text-xs font-bold text-accent-ink">{{ err('entry') }}</p>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-bundle">bundle（zip ≤ 100MB，服务端加密存储）</label>
            <FileInput id="sf-bundle" data-testid="bundle-file" accept=".zip,application/zip,application/x-zip-compressed"
              :disabled="bundleDisabled" @change="onBundleFile" />
            <p v-if="bundleDisabledHint" class="text-xs text-ink-soft">{{ bundleDisabledHint }}</p>
            <p v-if="bundle" data-testid="bundle-done" class="border-2 border-ink bg-paper px-2 py-1 font-mono text-[0.6875rem]">
              已上传 {{ (bundle.bytes / 1024 / 1024).toFixed(2) }} MB · sha256 {{ bundle.sha256.slice(0, 12) }}…
            </p>
            <p v-else-if="bundleLinkedOnly" class="border-2 border-ink bg-paper px-2 py-1 font-mono text-[0.6875rem]">已关联上传（重新选择文件可替换）</p>
            <span v-if="progress?.which === 'bundle'" data-testid="upload-progress" class="block font-mono text-[0.6875rem]">
              上传中 {{ progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : '…' }}%
            </span>
          </div>
          <div class="space-y-2">
            <p :class="labelClass">运行权限（高级，仅当作品代码确需时勾选）</p>
            <BaseCheckbox v-for="item in FEATURE_ITEMS" :key="item.key"
              v-model="form.features[item.key]" :data-testid="`feature-${item.key}`">
              <span class="font-bold">{{ item.label }}</span><span class="ml-1 text-xs text-ink-soft">{{ item.hint }}</span>
            </BaseCheckbox>
          </div>
        </template>
      </fieldset>

      <!-- 4. 封面 -->
      <fieldset class="space-y-2" :disabled="readOnly">
        <legend :class="labelClass">封面（可选，png/jpeg/webp ≤ 5MB）</legend>
        <FileInput data-testid="cover-file" aria-label="封面文件" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          @change="onCoverFile" />
        <img v-if="coverPreview" :src="coverPreview" alt="封面预览" class="mt-2 w-40 border-2 border-ink">
        <p v-else-if="cover" class="font-mono text-[0.6875rem]">已上传封面 {{ cover.upload_id.slice(0, 8) }}…</p>
        <p v-else-if="coverLinkedOnly" class="font-mono text-[0.6875rem]">已关联封面（重新选择文件可替换）</p>
        <span v-if="progress?.which === 'cover'" class="block font-mono text-[0.6875rem]">上传中…</span>
      </fieldset>

      <!-- 5. 操作 -->
      <div v-if="!readOnly" class="flex gap-3">
        <BaseButton variant="ink" lift data-testid="save-draft" :disabled="busy !== null" @click="save(false)">
          {{ busy === 'draft' ? '保存中…' : '存草稿' }}
        </BaseButton>
        <BaseButton variant="ink" lift class="bg-highlight" data-testid="submit-review" :disabled="busy !== null" @click="save(true)">
          {{ busy === 'submit' ? '提交中…' : '提交审核' }}
        </BaseButton>
        <RouterLink to="/submit" class="border-2 border-ink bg-surface px-3 py-2 text-sm font-bold">取消</RouterLink>
      </div>
    </form>
  </section>
</template>
