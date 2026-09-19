<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { repo, type DocMeta, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { session } from '@/auth'

const route = useRoute()
const onCatalog = computed(() => route.name === 'home')
const onDocs = computed(() => route.name === 'docs' || route.name === 'doc')

const { data: games } = useAsync<GameSummary[] | null>(
  () => (onCatalog.value ? repo.listGames() : Promise.resolve(null)),
  [onCatalog]
)
const { data: docs } = useAsync<DocMeta[] | null>(
  () => (onDocs.value ? repo.listDocs() : Promise.resolve(null)),
  [onDocs]
)

const sticker = computed(() => {
  if (onCatalog.value && games.value) return `共 ${games.value.length} 款`
  if (onDocs.value && docs.value) return `共 ${docs.value.length} 篇`
  return 'STATIC WEB GAMES'
})

const user = computed(() => session.state.user)

function logout(): void {
  session.logout()
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
      <RouterLink to="/" class="bg-ink px-2 py-1 text-sm font-extrabold tracking-[0.04em] text-paper">
        网页游戏收藏馆
      </RouterLink>
      <nav class="flex gap-4 text-sm font-bold">
        <RouterLink
          to="/"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onCatalog ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onCatalog ? 'page' : undefined"
        >游戏</RouterLink>
        <RouterLink
          to="/docs"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onDocs ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onDocs ? 'page' : undefined"
        >文档</RouterLink>
      </nav>
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
    </div>
  </header>
</template>
