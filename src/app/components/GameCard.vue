<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { GameSummary } from '@/data/types'
import { GAME_TYPE_LABELS, durationText } from '@/lib/labels'
import GameCover from './GameCover.vue'

defineProps<{ game: GameSummary }>()
</script>

<template>
  <RouterLink
    :to="`/games/${game.id}`"
    class="group block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 transition hover:border-neutral-600"
  >
    <GameCover :game="game" />
    <div class="space-y-2 p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="truncate font-medium group-hover:text-white">{{ game.name }}</h2>
        <span class="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
          {{ GAME_TYPE_LABELS[game.type] }}
        </span>
      </div>
      <p class="line-clamp-2 text-sm text-neutral-400">{{ game.description }}</p>
      <div class="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        <span>{{ durationText(game.durationMinutes) }}</span>
        <span v-for="tag in game.tags" :key="tag" class="rounded bg-neutral-800/70 px-1.5 py-0.5">{{ tag }}</span>
      </div>
    </div>
  </RouterLink>
</template>
