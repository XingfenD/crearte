<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NotFoundError, repo, type Game } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { renderMarkdown } from '@/lib/markdown'
import { GAME_TYPE_LABELS, durationText } from '@/lib/labels'
import GameCover from '@/components/GameCover.vue'
import StatePanel from '@/components/StatePanel.vue'

const props = defineProps<{ id: string }>()
const { data: game, error, loading, reload } = useAsync<Game>(
  () => repo.getGame(props.id),
  [computed(() => props.id)]
)

const notFound = computed(() => error.value instanceof NotFoundError)
const introHtml = computed(() => (game.value?.intro ? renderMarkdown(game.value.intro) : ''))
</script>

<template>
  <StatePanel :loading="loading" :error="notFound ? null : error" @retry="reload">
    <div v-if="notFound" class="py-24 text-center space-y-4">
      <p class="text-neutral-400">该游戏不存在或已移除。</p>
      <RouterLink to="/" class="inline-block text-violet-400 hover:underline">返回目录</RouterLink>
    </div>

    <article v-else-if="game" class="mx-auto max-w-3xl space-y-6">
      <RouterLink to="/" class="inline-block text-sm text-neutral-400 hover:text-neutral-200">← 返回目录</RouterLink>

      <div class="overflow-hidden rounded-xl border border-neutral-800">
        <GameCover :game="game" />
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-semibold">{{ game.name }}</h1>
          <span class="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
            {{ GAME_TYPE_LABELS[game.type] }}
          </span>
        </div>
        <p class="text-sm text-neutral-400">
          作者：
          <a v-if="game.author.url" :href="game.author.url" target="_blank" rel="noopener noreferrer" class="text-violet-400 hover:underline">
            {{ game.author.name }}
          </a>
          <span v-else>{{ game.author.name }}</span>
          <span class="mx-2 text-neutral-700">·</span>
          预计时长：{{ durationText(game.durationMinutes) }}
          <span class="mx-2 text-neutral-700">·</span>
          收录于 {{ game.addedAt }}
        </p>
        <p class="text-neutral-300">{{ game.description }}</p>
        <div class="flex flex-wrap gap-1.5 text-xs text-neutral-400">
          <span v-for="tag in game.tags" :key="tag" class="rounded bg-neutral-800/70 px-2 py-0.5">{{ tag }}</span>
        </div>
      </div>

      <a
        :href="game.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block rounded-lg bg-violet-600 px-5 py-2.5 font-medium hover:bg-violet-500"
      >开始游戏 ↗</a>

      <div v-if="introHtml" class="markdown-body border-t border-neutral-800 pt-4" v-html="introHtml" />
    </article>
  </StatePanel>
</template>
