<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { PhArrowLeft, PhArrowSquareOut } from '@phosphor-icons/vue'
import { NotFoundError, repo, resolveUserSlug, type Game } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { renderMarkdown } from '@/lib/markdown'
import { toInterstitialIfExternal } from '@/lib/externalLink'
import { authorDisplayName, durationText } from '@/lib/labels'
import { gameNotFoundTitle, gameTitle, setPageDescription, setPageTitle } from '@/lib/pageTitle'
import GameCover from '@/components/GameCover.vue'
import GameReactions from '@/components/GameReactions.vue'
import StatePanel from '@/components/StatePanel.vue'
import GameHost from '../../runtime/host/GameHost.vue'

const props = defineProps<{ user: string; slug: string }>()
const router = useRouter()
const origin = location.origin
const gameId = computed(() => `${props.user}/${props.slug}`)
const { data: game, error, loading, reload } = useAsync<Game>(
  () => repo.getGame(gameId.value),
  [gameId]
)

const notFound = computed(() => error.value instanceof NotFoundError)

// 数据到达后精化标题。notFound 时 data 恒为 null，单 watch(game) 不会触发，故一并观察 error。
watch([game, error], () => {
  if (notFound.value) {
    setPageTitle(gameNotFoundTitle())
    setPageDescription('')
  } else if (game.value) {
    setPageTitle(gameTitle(game.value.name))
    setPageDescription(game.value.description ?? '')
  }
})
// 链接目标与显示文本分离：目标永远取命名空间 user，与 author.name 无涉
const authorUser = computed(() => (game.value ? resolveUserSlug(game.value).user : ''))
const introHtml = computed(() =>
  game.value?.intro ? renderMarkdown(game.value.intro, location.origin) : ''
)
const playable = computed(() => game.value?.runtime === 'virtual' || game.value?.runtime === 'hosted')
function onExit(): void {
  router.push('/games')
}
</script>

<template>
  <StatePanel :loading="loading" :error="notFound ? null : error" @retry="reload">
    <div v-if="notFound" class="border-2 border-dashed border-ink p-10 text-center">
      <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">GAME NOT FOUND</p>
      <h1 class="mt-3 text-lg font-extrabold">该作品不存在或已移除。</h1>
      <RouterLink to="/games" class="btn-ink lift mt-5 hover:shadow-hard active:shadow-none">返回目录</RouterLink>
    </div>

    <article v-else-if="game" class="mx-auto w-full space-y-6" :class="playable ? 'max-w-5xl' : 'max-w-3xl'">
      <RouterLink
        to="/games"
        class="inline-flex items-center gap-1.5 font-mono text-xs text-accent-ink underline decoration-2 underline-offset-2"
      >
        <PhArrowLeft :size="14" weight="bold" aria-hidden="true" />返回目录
      </RouterLink>

      <div class="border-2 border-ink shadow-hard-lg">
        <GameCover :game="game" ratio="hero" />
      </div>

      <div class="space-y-3">
        <h1 class="font-display text-[2.125rem] font-black leading-[1.1]">{{ game.name }}</h1>
        <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">
          作者：
          <RouterLink
            v-if="authorUser"
            :to="'/users/' + authorUser"
            class="text-accent-ink underline decoration-2 underline-offset-2"
          >{{ authorDisplayName(game) }}</RouterLink>
          <a
            v-else-if="game.author?.url"
            :href="toInterstitialIfExternal(game.author.url, origin)"
            target="_blank"
            rel="noopener"
            class="text-accent-ink underline decoration-2 underline-offset-2"
          >{{ authorDisplayName(game) }}</a>
          <span v-else>{{ authorDisplayName(game) }}</span>
          <span class="mx-2">·</span>预计时长：{{ durationText(game.durationMinutes) }}
          <span class="mx-2">·</span>收录于 {{ game.addedAt }}
        </p>
        <p v-if="game.description" class="text-sm leading-[1.8] text-ink-soft">{{ game.description }}</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in game.tags"
            :key="tag"
            class="border-[1.5px] border-ink bg-surface px-2 py-0.5 font-mono text-[0.6875rem]"
          >{{ tag }}</span>
        </div>
      </div>

      <GameHost v-if="playable" :game="game" @exit="onExit" />
      <a
        v-else-if="game.url"
        :href="toInterstitialIfExternal(game.url, origin, 'game')"
        target="_blank"
        rel="noopener"
        class="lift inline-flex items-center gap-2 border-2 border-ink bg-ink px-5 py-2.5 font-extrabold text-paper shadow-hard-accent hover:shadow-hard-accent-lg active:shadow-none"
      >
        开始体验
        <PhArrowSquareOut :size="16" weight="bold" aria-hidden="true" />
      </a>

      <GameReactions v-if="game" :game="game" />

      <div v-if="introHtml" class="border-t-[3px] border-ink pt-6">
        <div class="markdown-body" v-html="introHtml" />
      </div>
    </article>
  </StatePanel>
</template>
