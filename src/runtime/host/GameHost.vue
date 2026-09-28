<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PhArrowsInSimple, PhArrowsOutSimple } from '@phosphor-icons/vue'
import type { Game } from '../../app/data/types'
import { runtimeConfig } from './config'
import { resolveRuntimeTargets, type RuntimeTarget } from './adapters'
import { useGameFrame } from './useGameFrame'
import { useFullscreen } from './useFullscreen'
import { DEFAULT_FEATURES } from '../bridge/protocol'

const props = defineProps<{ game: Game }>()
const config = runtimeConfig()
const frame = useGameFrame({
  targets: () => targets.value,
  features: () => ({ ...DEFAULT_FEATURES, ...props.game.features }),
  hostOrigin: config.hostOrigin,
  onExternal: (url) => {
    if (url === '__exit__') { emit('exit'); return }
    degradedToExternal.value = url
  },
  onEvent: (event) => { if (event.type === 'game:error') lastError.value = event.message }
})
const emit = defineEmits<{ exit: [] }>()
// 全屏目标 = 整个游玩区（展柜 + 控制按钮）；状态由 fullscreenchange 同步，Esc/他方抢占都能正确回落
const fullscreen = useFullscreen()
const targets = computed<RuntimeTarget[]>(() => resolveRuntimeTargets(props.game, {
  baseDomain: config.baseDomain,
  protocol: location.protocol,
  config
}))
const degradedToExternal = ref<string | null>(null)
const lastError = ref<string | null>(null)
const aspect = computed(() => props.game.display?.aspect ?? '16:9')
const aspectClass = computed(() => aspect.value === '4:3' ? 'aspect-[4/3]' : aspect.value === 'fill' ? 'h-[70vh]' : 'aspect-video')
const iframeSrc = computed(() => frame.target.value?.url ?? '')
// 展柜标题栏的运行时徽标：降级外链优先于目标模式（degrade() 已切到 external 目标）
const runtimeBadge = computed(() => {
  if (degradedToExternal.value) return { label: '已降级外链', cls: 'bg-accent text-paper' }
  return { label: frame.target.value?.mode === 'hosted' ? '托管运行' : '站内运行', cls: 'bg-ink text-paper' }
})
// 状态点：与 useGameFrame 的 phase 机一一对应
const statusInfo = computed(() => {
  switch (frame.state.value.phase) {
    case 'booting': return { label: '加载中', dot: 'bg-highlight' }
    case 'ready': return { label: '就绪', dot: 'bg-success' }
    case 'degraded': return { label: '已降级', dot: 'bg-accent' }
    default: return { label: '加载失败', dot: 'bg-accent-ink' }
  }
})
const frameKey = ref(0)
watch(() => props.game.version, restart)
watch(() => props.game.id, restart)
function restart(): void {
  degradedToExternal.value = null
  lastError.value = null
  frameKey.value++
  frame.stop()
  frame.start()
}

function onIframeLoad(): void {
  // iframe 加载完成不等于桥就绪：virtual 模式等 agent:boot，hosted 模式已由 start() 置为 ready
}
onMounted(() => {
  window.addEventListener('message', onMessage)
  document.addEventListener('fullscreenchange', fullscreen.sync)
  frame.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  document.removeEventListener('fullscreenchange', fullscreen.sync)
  frame.stop()
})
function onMessage(event: MessageEvent): void { frame.onMessage(event) }
</script>

<template>
  <div class="space-y-3" :ref="(el) => fullscreen.attach(el as HTMLElement)"
       :class="fullscreen.isFullscreen.value && 'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper p-3'">
    <!-- 展柜外框：与封面框/控制按钮同一套墨纸语言（base 层全局 border-radius:0）；全屏时撑满纵向空间 -->
    <div class="border-2 border-ink bg-paper shadow-hard"
         :class="fullscreen.isFullscreen.value && 'flex min-h-0 flex-1 flex-col'">
      <!-- 标题栏：作品名 + 运行时徽标 + 状态 -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-ink px-3 py-2">
        <span class="min-w-0 flex-1 truncate text-sm font-bold" :title="game.name">{{ game.name }}</span>
        <span class="border-[1.5px] border-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold" :class="runtimeBadge.cls">{{ runtimeBadge.label }}</span>
        <span class="flex items-center gap-1.5 font-mono text-[0.6875rem] text-ink-soft">
          <span class="inline-block h-2 w-2 border border-ink" :class="statusInfo.dot" aria-hidden="true" />
          {{ statusInfo.label }}
        </span>
      </div>
      <!-- 播放区：内容区不做主题化（bg-ink 仅作屏幕底色），保证作品忠实呈现；全屏时撑满剩余空间 -->
      <div class="relative overflow-hidden bg-ink" :class="fullscreen.isFullscreen.value ? 'min-h-0 flex-1' : aspectClass">
        <iframe
          v-if="!degradedToExternal"
          :key="frameKey"
          :ref="(el) => frame.attach(el as HTMLIFrameElement)"
          :src="iframeSrc"
          :sandbox="frame.sandbox"
          :allow="frame.allow.value"
          referrerpolicy="no-referrer"
          :title="game.name"
          class="h-full w-full border-0 bg-white"
          @load="onIframeLoad"
        />
        <div v-else class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p class="text-sm text-ink-soft">站内运行不可用：{{ frame.state.value.error }}</p>
          <a :href="degradedToExternal" target="_blank" rel="noopener noreferrer"
             class="btn-ink lift">在新标签打开 ↗</a>
        </div>
        <div v-if="frame.state.value.phase === 'booting' && !degradedToExternal"
             class="absolute inset-0 grid place-items-center bg-paper/95">
          <div class="w-64 max-w-[80%] space-y-2">
            <p class="font-mono text-xs text-ink">
              正在加载作品…<span v-if="frame.state.value.progress !== null"> {{ frame.state.value.progress }}%</span>
            </p>
            <div class="h-4 border-2 border-ink bg-surface shadow-hard-sm">
              <div class="h-full bg-accent transition-[width] duration-200"
                   :style="{ width: `${frame.state.value.progress ?? 0}%` }" />
            </div>
          </div>
        </div>
        <div v-if="frame.state.value.phase === 'error'"
             class="absolute inset-0 grid place-items-center bg-paper/95 p-6 text-center">
          <div class="space-y-3">
            <p class="text-sm font-bold text-accent-ink">作品加载失败：{{ frame.state.value.error }}</p>
            <button class="btn-ink lift" @click="restart()">重试</button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button class="btn-surface lift px-3 py-1.5" @click="frame.pause()">暂停</button>
      <button class="btn-surface lift px-3 py-1.5" @click="frame.resume()">继续</button>
      <button class="btn-surface lift px-3 py-1.5" @click="restart()">重开</button>
      <button class="btn-surface lift px-3 py-1.5" @click="frame.clearSave()">清除存档</button>
      <button v-if="!fullscreen.isFullscreen.value" class="btn-surface lift px-3 py-1.5" @click="fullscreen.toggle()">
        <PhArrowsOutSimple :size="14" weight="bold" aria-hidden="true" />全屏
      </button>
      <button v-else class="btn-surface lift px-3 py-1.5" @click="fullscreen.toggle()">
        <PhArrowsInSimple :size="14" weight="bold" aria-hidden="true" />退出全屏
      </button>
      <button class="btn-surface lift px-3 py-1.5" @click="emit('exit')">退出</button>
      <span v-if="frame.state.value.score !== null" class="font-mono text-xs text-ink-soft">得分：{{ frame.state.value.score }}</span>
      <span v-if="frame.state.value.storageKeys !== null" class="font-mono text-xs text-ink-soft">存档：{{ frame.state.value.storageKeys }} 项</span>
      <span v-if="lastError" class="font-mono text-xs text-accent-ink">{{ lastError }}</span>
    </div>
  </div>
</template>
