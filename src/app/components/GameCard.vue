<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { resolveUserSlug, type GameSummary } from '@/data/types'
import { GAME_TYPE_LABELS, authorDisplayName, durationText } from '@/lib/labels'
import GameCover from './GameCover.vue'

const props = withDefaults(defineProps<{ game: GameSummary; headingLevel?: number }>(), { headingLevel: 2 })

const headingTag = computed(() => `h${props.headingLevel}`)

const gamePath = computed(() => {
  const { user, slug } = resolveUserSlug(props.game)
  return user ? `/games/${user}/${slug}` : `/games/${slug}`
})

// 链接目标与显示文本分离：目标永远取命名空间 user，与 author.name 无涉
const authorUser = computed(() => resolveUserSlug(props.game).user)

const MAX_TAGS = 2
const visibleTags = computed(() => props.game.tags.slice(0, MAX_TAGS))
const hiddenTags = computed(() => props.game.tags.slice(MAX_TAGS))
</script>

<template>
  <div
    data-testid="game-card"
    class="lift relative block border-2 border-ink bg-surface shadow-hard hover:shadow-hard-lg active:shadow-none"
  >
    <div class="relative border-b-2 border-ink">
      <GameCover :game="game" />
      <span
        class="absolute left-2 top-2 -rotate-3 border-2 border-ink bg-surface px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.05em]"
      >{{ GAME_TYPE_LABELS[game.type] }}</span>
    </div>
    <div class="space-y-2 p-3">
      <component :is="headingTag" class="truncate font-display text-[0.875rem] font-black">
        <!-- 拉伸链接：伪元素铺满整卡承载点击，锚点本身只含标题文本 -->
        <RouterLink :to="gamePath" class="after:absolute after:inset-0">{{ game.name }}</RouterLink>
      </component>
      <p v-if="game.description" class="line-clamp-2 text-xs leading-relaxed text-ink-soft">{{ game.description }}</p>
      <p class="text-xs text-ink-soft">
        作者：
        <RouterLink
          v-if="authorUser"
          :to="'/users/' + authorUser"
          class="relative z-10 underline decoration-2 underline-offset-2"
        >{{ authorDisplayName(game) }}</RouterLink>
        <template v-else>{{ authorDisplayName(game) }}</template>
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="border-[1.5px] border-ink px-1 py-0.5 font-mono text-[0.625rem]">
          {{ durationText(game.durationMinutes) }}
        </span>
        <span
          v-for="tag in visibleTags"
          :key="tag"
          class="border-[1.5px] border-ink px-1 py-0.5 font-mono text-[0.625rem]"
        >{{ tag }}</span>
        <span
          v-if="hiddenTags.length"
          class="border-[1.5px] border-ink px-1 py-0.5 font-mono text-[0.625rem]"
        >+{{ hiddenTags.length }}<span class="sr-only">：{{ hiddenTags.join('、') }}</span></span>
        <span
          v-if="game.source === 'static'"
          class="border-[1.5px] border-ink bg-highlight px-1 py-0.5 font-mono text-[0.625rem]"
        >社区投稿</span>
      </div>
    </div>
  </div>
</template>
