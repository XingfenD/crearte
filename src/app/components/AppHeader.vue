<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { repo, type DocMeta, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { useTheme } from '@/composables/useTheme'
import { authEnabled, session } from '@/auth'

const route = useRoute()
const detailsRef = ref<HTMLDetailsElement | null>(null)
const menuOpen = ref(false)
const summaryRef = ref<HTMLElement | null>(null)

watch(() => route.fullPath, () => {
  if (detailsRef.value?.open) detailsRef.value.open = false
})

function onDocPointerDown(e: PointerEvent): void {
  if (menuOpen.value && detailsRef.value && !detailsRef.value.contains(e.target as Node)) {
    detailsRef.value.open = false
  }
}
function onDocKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && menuOpen.value && detailsRef.value) {
    detailsRef.value.open = false
    summaryRef.value?.focus()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onDocKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onDocKeydown)
})
const onCatalog = computed(() => route.name === 'catalog')
const showGameCount = computed(() => route.name === 'catalog' || route.name === 'home')
const onDocs = computed(() => route.name === 'docs' || route.name === 'doc')
const onCreator = computed(() => route.name === 'creator')

const { data: games } = useAsync<GameSummary[] | null>(
  () => (showGameCount.value ? repo.listGames() : Promise.resolve(null)),
  [showGameCount]
)
const { data: docs } = useAsync<DocMeta[] | null>(
  () => (onDocs.value ? repo.listDocs() : Promise.resolve(null)),
  [onDocs]
)

const sticker = computed(() => {
  if (showGameCount.value && games.value) return `共 ${games.value.length} 款`
  if (onDocs.value && docs.value) return `共 ${docs.value.length} 篇`
  return 'HOST YOUR CREATIONS'
})

const user = computed(() => session.state.user)
const isAdmin = computed(() => user.value?.role === 'admin')

// P13 D-I：主题开关。aria-label 同时说明当前态与动作（两态开关无可见标签，
// AT 用户须能听到状态）；图标字形包 aria-hidden（与 P9-B 星形按钮、P12 caret 同范式）。
const { theme, toggle } = useTheme()
const themeLabel = computed(() =>
  theme.value === 'dark' ? '切换为亮色主题（当前：暗色）' : '切换为暗色主题（当前：亮色）'
)

function logout(): void {
  session.logout()
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-6">
      <RouterLink to="/" class="bg-ink px-2 py-1 text-sm font-extrabold tracking-[0.04em] text-paper">
        crearte <span class="text-[0.6875rem] tracking-[0.2em]">创艺</span>
      </RouterLink>
      <nav class="flex gap-2 text-sm font-bold sm:gap-4">
        <RouterLink
          to="/games"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onCatalog ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onCatalog ? 'page' : undefined"
        >作品</RouterLink>
        <RouterLink
          to="/docs"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onDocs ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onDocs ? 'page' : undefined"
        >文档</RouterLink>
        <RouterLink
          to="/creator"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onCreator ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onCreator ? 'page' : undefined"
        >创作者中心</RouterLink>
      </nav>
      <span
        class="ml-auto hidden border-2 border-ink bg-highlight px-2 py-0.5 font-mono text-[0.6875rem] tracking-[0.05em] sm:inline-block"
      >{{ sticker }}</span>

      <template v-if="authEnabled">
        <RouterLink
          v-if="!user"
          to="/login"
          class="ml-auto border-2 border-ink bg-surface px-2 py-1 text-xs font-bold sm:ml-0"
        >登录</RouterLink>

        <details v-else ref="detailsRef" class="relative ml-auto sm:ml-0" @toggle="menuOpen = ($event.target as HTMLDetailsElement).open">
          <summary
            ref="summaryRef"
            :title="user.display_name"
            class="flex max-w-[6rem] min-w-0 list-none cursor-pointer select-none items-center gap-1 border-2 border-ink bg-surface px-2 py-1 text-xs font-bold [&::-webkit-details-marker]:hidden"
          >
            <span class="min-w-0 truncate">{{ user.display_name }}</span>
            <span class="shrink-0" aria-hidden="true">▾</span>
          </summary>
          <div class="absolute right-0 z-50 mt-1 w-32 border-2 border-ink bg-surface shadow-hard">
            <RouterLink to="/submit" class="block px-3 py-2 text-xs font-bold hover:bg-paper">提交作品</RouterLink>
            <RouterLink
              v-if="isAdmin"
              to="/admin"
              class="block border-t-2 border-ink px-3 py-2 text-xs font-bold hover:bg-paper"
            >审核</RouterLink>
            <RouterLink to="/account" class="block border-t-2 border-ink px-3 py-2 text-xs font-bold hover:bg-paper">我的账号</RouterLink>
            <button type="button" class="block w-full border-t-2 border-ink px-3 py-2 text-left text-xs font-bold hover:bg-paper" @click="logout">登出</button>
          </div>
        </details>
      </template>

      <!-- P13 D-I：主题开关，必须 h-8 w-8（32px；spike 3 实测 28px 在最坏格 margin 仅 5px）、
           shrink-0（否则被 flex 压缩）；落点与 gap-2 sm:gap-6 / gap-2 sm:gap-4 同为候选 B，
           最坏格 @320px 登录态 ascii60 margin=16 且不触碰 P12 的 max-w-[6rem] 钉桩 -->
      <button
        type="button"
        data-testid="theme-toggle"
        class="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ink bg-surface text-sm font-bold"
        :aria-label="themeLabel"
        :title="themeLabel"
        @click="toggle"
      >
        <span aria-hidden="true">{{ theme === 'dark' ? '☀' : '☾' }}</span>
      </button>
    </div>
  </header>
</template>
