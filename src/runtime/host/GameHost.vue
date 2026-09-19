<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Game } from '../../app/data/types'
import { runtimeConfig } from './config'
import { resolveRuntimeTargets, type RuntimeTarget } from './adapters'
import { useGameFrame } from './useGameFrame'
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
  frame.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  frame.stop()
})
function onMessage(event: MessageEvent): void { frame.onMessage(event) }
</script>

<template>
  <div class="space-y-3">
    <div class="relative overflow-hidden rounded-xl border border-neutral-800 bg-black" :class="aspectClass">
      <iframe
        v-if="!degradedToExternal"
        :key="frameKey"
        :ref="(el) => frame.attach(el as HTMLIFrameElement)"
        :src="iframeSrc"
        :sandbox="frame.sandbox"
        :allow="frame.allow.value"
        allowfullscreen
        referrerpolicy="no-referrer"
        :title="game.name"
        class="h-full w-full border-0 bg-white"
        @load="onIframeLoad"
      />
      <div v-else class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p class="text-neutral-300">站内运行不可用：{{ frame.state.value.error }}</p>
        <a :href="degradedToExternal" target="_blank" rel="noopener noreferrer"
           class="rounded-lg bg-violet-600 px-5 py-2.5 font-medium hover:bg-violet-500">在新标签打开 ↗</a>
      </div>
      <div v-if="frame.state.value.phase === 'booting' && !degradedToExternal"
           class="absolute inset-0 grid place-items-center bg-black/70 text-sm text-neutral-300">
        正在加载作品…
      </div>
      <div v-if="frame.state.value.phase === 'error'"
           class="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm text-neutral-300">
        <div class="space-y-3">
          <p>作品加载失败：{{ frame.state.value.error }}</p>
          <button class="rounded-md bg-violet-600 px-4 py-2 hover:bg-violet-500" @click="restart()">重试</button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button class="btn-surface lift px-3 py-1.5" @click="frame.pause()">暂停</button>
      <button class="btn-surface lift px-3 py-1.5" @click="frame.resume()">继续</button>
      <button class="btn-surface lift px-3 py-1.5" @click="restart()">重开</button>
      <button class="btn-surface lift px-3 py-1.5" @click="frame.clearSave()">清除存档</button>
      <button class="btn-surface lift px-3 py-1.5" @click="emit('exit')">退出</button>
      <span v-if="frame.state.value.score !== null" class="font-mono text-xs text-ink-soft">得分：{{ frame.state.value.score }}</span>
      <span v-if="frame.state.value.storageKeys !== null" class="font-mono text-xs text-ink-soft">存档：{{ frame.state.value.storageKeys }} 项</span>
      <span v-if="lastError" class="font-mono text-xs text-accent-ink">{{ lastError }}</span>
    </div>
  </div>
</template>
