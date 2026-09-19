<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { PhArrowSquareOut, PhWarningCircle } from '@phosphor-icons/vue'
import { normalizeKind, parseTarget } from '@/lib/externalLink'

const route = useRoute()
const router = useRouter()

function queryValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

const kind = computed(() => normalizeKind(queryValue(route.query.kind)))
const heading = computed(() =>
  kind.value === 'game' ? '即将前往第三方站点开始体验' : '即将离开本站'
)

const state = computed(() => {
  const result = parseTarget(queryValue(route.query.to), location.origin)
  if (result.status === 'external') {
    return { view: 'external' as const, url: result.url, host: result.host, href: '' }
  }
  if (result.status === 'same-origin') {
    return { view: 'same-origin' as const, url: '', host: '', href: result.href }
  }
  return { view: 'invalid' as const, url: '', host: '', href: '' }
})

watchEffect(() => {
  if (state.value.view === 'same-origin' && !state.value.href.startsWith('/out')) {
    void router.replace(state.value.href)
  }
})

function goOn(url: string): void {
  window.location.replace(url)
}

function goBack(): void {
  if (window.history.length > 1) window.history.back()
  else void router.replace('/')
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <div v-if="state.view === 'invalid'" class="border-2 border-ink bg-surface p-6 shadow-hard">
      <p class="inline-flex items-center gap-1.5 bg-accent-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-[0.05em] text-paper">
        <PhWarningCircle :size="14" weight="bold" aria-hidden="true" />
        ERROR · 链接无效
      </p>
      <h1 class="mt-3 font-display text-[1.625rem] font-black">链接无效</h1>
      <p class="mt-3 text-sm leading-[1.8] text-ink-soft">
        该链接地址不合法，已阻止跳转。请返回上一页，或联系站点维护者。
      </p>
      <p class="mt-3 font-mono text-xs text-ink-soft">
        反馈：
        <a
          href="mailto:xingfen.fendy@outlook.com"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >xingfen.fendy@outlook.com</a>
        <span class="mx-2">·</span>
        <RouterLink
          to="/docs/about"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >关于本站</RouterLink>
      </p>
      <button
        type="button"
        class="btn-ink lift mt-5 hover:shadow-hard active:shadow-none"
        @click="goBack"
      >
        返回
      </button>
    </div>

    <div v-else-if="state.view === 'external'" class="border-2 border-ink bg-surface p-6 shadow-hard">
      <p class="font-mono text-[0.6875rem] tracking-[0.18em] text-ink-soft">OUTBOUND LINK</p>
      <h1 class="mt-3 font-display text-[1.625rem] font-black">{{ heading }}</h1>

      <template v-if="kind === 'game'">
        <p class="mt-4 text-sm leading-[1.8] text-ink-soft">
          该作品由第三方提供并托管在其站点，本站仅收录链接与介绍。
        </p>
        <p class="mt-3 text-sm leading-[1.8] text-ink-soft">
          作品内容<strong class="font-extrabold text-ink">可能与其被收录时不同</strong>，也可能随时变更、下架或停止服务；内容、版权与数据均由第三方负责，与本站无关。
        </p>
        <p class="mt-3 text-sm leading-[1.8] text-ink-soft">
          如发现违规、侵权或不适内容，请通过邮件反馈，或查看「关于本站」了解处理流程，我们会尽快核实处理。
        </p>
      </template>
      <p v-else class="mt-4 text-sm leading-[1.8] text-ink-soft">
        你将前往第三方站点，其内容与隐私政策由该站点负责，本站无法控制亦不承担责任。请确认链接可信后再继续。
      </p>

      <div class="mt-5 border-2 border-ink p-3">
        <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">目标站点</p>
        <p class="mt-1 font-mono text-sm font-bold">{{ state.host }}</p>
        <p class="mt-1 break-all font-mono text-xs text-ink-soft">{{ state.url }}</p>
      </div>

      <p v-if="kind === 'game'" class="mt-3 font-mono text-xs text-ink-soft">
        反馈：
        <a
          href="mailto:xingfen.fendy@outlook.com"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >xingfen.fendy@outlook.com</a>
        <span class="mx-2">·</span>
        <RouterLink
          to="/docs/about"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >关于本站</RouterLink>
      </p>

      <div class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          class="btn-ink lift inline-flex items-center gap-2 hover:shadow-hard active:shadow-none"
          @click="goOn(state.url)"
        >
          继续访问
          <PhArrowSquareOut :size="16" weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="btn-surface lift hover:shadow-hard active:shadow-none"
          @click="goBack"
        >
          返回
        </button>
      </div>
    </div>
  </div>
</template>
