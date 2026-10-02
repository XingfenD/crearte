<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { session } from '@/auth'
import { resolveUserSlug, type Game } from '@/data/types'
import { reactionsEnabled, fetchMine, setFavorite, setRating, unrate, type ReactionView } from '@/lib/reactions'

const props = defineProps<{ game: Game }>()
const router = useRouter()
const route = useRoute()
const { user, slug } = resolveUserSlug(props.game)
const workId = `${user}/${slug}`

const favorited = ref(false)
const rated = ref(false)
const score = ref(0)
const favoriteCount = ref(props.game.favoriteCount ?? 0)
const ratingCount = ref(props.game.ratingCount ?? 0)
const ratingAvg = ref<number | undefined>(props.game.ratingAvg)
const busy = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  // noauth/匿名零请求：无 token 不初始化个人态（聚合数来自 props，不受影响）
  if (!reactionsEnabled || !session.getToken()) return
  try {
    const mine = await fetchMine()
    favorited.value = mine.favorites.includes(workId)
    const personal = mine.ratings[workId]
    if (typeof personal === 'number') {
      rated.value = true
      score.value = personal
    }
  } catch {
    // 个人态初始化失败不打扰：聚合照常显示，交互路径自带错误处理
  }
})

// 每次写成功后用服务端 ReactionView 全量替换本地态（禁自行加减）
function apply(view: ReactionView): void {
  favoriteCount.value = view.favoriteCount
  ratingCount.value = view.ratingCount
  ratingAvg.value = view.ratingAvg
  favorited.value = view.favorited
  rated.value = view.rated
  score.value = view.score ?? 0
}

async function run(action: () => Promise<ReactionView>): Promise<void> {
  if (busy.value) return
  if (!session.getToken()) {
    await router.push({ name: 'login', query: { next: route.fullPath } })
    return
  }
  busy.value = true
  error.value = null
  try {
    apply(await action())
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function toggleFav(): void {
  void run(() => setFavorite(user, slug, !favorited.value))
}

// 点当前分 = 撤评；否则打分（含改分）
function pickStar(i: number): void {
  if (rated.value && score.value === i) void run(() => unrate(user, slug))
  else void run(() => setRating(user, slug, i))
}

// 已评点亮个人分，未评点亮 floor(均值)
const litStars = computed(() => (rated.value ? score.value : Math.floor(ratingAvg.value ?? 0)))
const summaryText = computed(() =>
  `${ratingCount.value > 0 ? `${ratingAvg.value} · ${ratingCount.value} 人评分` : '暂无评分'} · ${favoriteCount.value} 收藏`
)
</script>

<template>
  <section v-if="reactionsEnabled" class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <button
      type="button"
      data-testid="fav-btn"
      :aria-pressed="favorited"
      :disabled="busy"
      class="lift inline-flex items-center gap-1.5 border-2 border-ink bg-surface px-3 py-1.5 text-sm font-extrabold shadow-hard-sm hover:shadow-hard active:shadow-none disabled:opacity-60"
      @click="toggleFav"
    >
      <span aria-hidden="true">{{ favorited ? '♥' : '♡' }}</span>收藏
    </button>
    <span
      class="inline-flex items-center"
      role="group"
      :aria-label="rated ? `评分：${score} 星` : '评分'"
    >
      <button
        v-for="i in 5"
        :key="i"
        type="button"
        :data-testid="`star-${i}`"
        :aria-label="rated && i === score ? `已评 ${i} 星，点击取消评分` : `评 ${i} 星`"
        :disabled="busy"
        class="px-0.5 font-mono text-base leading-none disabled:opacity-60"
        @click="pickStar(i)"
      ><span aria-hidden="true" :class="i <= litStars ? 'text-accent-ink' : 'text-ink-soft'">{{ i <= litStars ? '★' : '☆' }}</span></button>
    </span>
    <p class="font-mono text-xs text-ink-soft">{{ summaryText }}</p>
    <p
      v-if="error"
      class="reaction-error basis-full font-mono text-xs text-accent-ink"
      role="alert"
      aria-live="polite"
    >{{ error }}</p>
  </section>
</template>
