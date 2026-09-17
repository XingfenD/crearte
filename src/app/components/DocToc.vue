<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TocItem } from '@/lib/markdown'

const props = defineProps<{ items: TocItem[] }>()
const activeId = ref('')
let observer: IntersectionObserver | undefined

function observe(): void {
  observer?.disconnect()
  const headings = props.items
    .map((item) => document.getElementById(item.id))
    .filter((el): el is HTMLElement => el !== null)
  if (!headings.length) return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeId.value = visible[0].target.id
    },
    { rootMargin: '0px 0px -70% 0px' }
  )
  for (const heading of headings) observer.observe(heading)
}

onMounted(() => void nextTick(observe))
watch(() => props.items, () => void nextTick(observe))
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <nav v-if="items.length" class="sticky top-20 border-l-[3px] border-ink text-xs" aria-label="本页目录">
    <p class="pb-2 pl-3 text-[0.625rem] font-extrabold tracking-[0.2em] text-ink-soft">本页目录</p>
    <a
      v-for="item in items"
      :key="item.id"
      :href="`#${item.id}`"
      class="-ml-[3px] block border-l-[3px] py-1"
      :class="[
        item.level === 3 ? 'pl-6' : 'pl-3',
        item.id === activeId
          ? 'border-accent-ink font-bold text-accent-ink'
          : 'border-transparent text-ink-soft hover:text-ink'
      ]"
    >{{ item.text }}</a>
  </nav>
</template>
