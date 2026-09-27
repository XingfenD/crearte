<script setup lang="ts">
// 自定义下拉列表（listbox）：原生 <select> 的展开列表由操作系统渲染、无法套用站点
// 纸墨风格，这里用 button + 自绘面板实现同款外观（border-2 border-ink / shadow-hard /
// 高亮选中项），并保留键盘导航与 listbox 语义。
// data-testid / id / class 等透传属性落在 trigger 按钮上（保持既有 e2e 选择器可用）。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PhCaretDown, PhCheck } from '@phosphor-icons/vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    modelValue?: string
    options: { value: string; label: string }[]
    disabled?: boolean
  }>(),
  { disabled: false }
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const activeIndex = ref(0)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLDivElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? ''
)

function openPanel(): void {
  if (props.disabled) return
  const idx = props.options.findIndex((o) => o.value === props.modelValue)
  activeIndex.value = idx >= 0 ? idx : 0
  open.value = true
  void nextTick(focusActive)
}

function closePanel(refocus = true): void {
  open.value = false
  if (refocus) triggerRef.value?.focus()
}

function choose(value: string): void {
  emit('update:modelValue', value)
  closePanel()
}

function focusActive(): void {
  panelRef.value
    ?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)
    ?.focus()
}

function onTriggerKey(e: KeyboardEvent): void {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
    e.preventDefault()
    openPanel()
  }
}

function onPanelKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    closePanel()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1)
    focusActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    focusActive()
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    choose(props.options[activeIndex.value].value)
  } else if (e.key === 'Tab') {
    closePanel(false)
  }
}

function onDocMouseDown(e: MouseEvent): void {
  if (!open.value) return
  const root = triggerRef.value?.parentElement
  if (root && !root.contains(e.target as Node)) closePanel(false)
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      v-bind="$attrs"
      type="button"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      class="flex w-full items-center justify-between gap-2 border-2 border-ink bg-surface py-2 pl-3 pr-2 text-left disabled:opacity-60"
      @click="open ? closePanel() : openPanel()"
      @keydown="onTriggerKey"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <PhCaretDown :size="12" weight="bold" aria-hidden="true" class="shrink-0" />
    </button>
    <div
      v-if="open"
      ref="panelRef"
      role="listbox"
      class="absolute left-0 right-0 top-full z-20 mt-0.5 border-2 border-ink bg-surface shadow-hard"
      @keydown="onPanelKey"
    >
      <button
        v-for="(opt, i) in options"
        :key="opt.value"
        :data-idx="i"
        type="button"
        role="option"
        :aria-selected="opt.value === modelValue"
        :tabindex="i === activeIndex ? 0 : -1"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        :class="opt.value === modelValue ? 'bg-highlight font-bold' : i === activeIndex ? 'bg-paper' : ''"
        @click="choose(opt.value)"
        @focus="activeIndex = i"
      >
        <PhCheck
          v-if="opt.value === modelValue"
          :size="12"
          weight="bold"
          aria-hidden="true"
          class="shrink-0"
        />
        <span class="truncate">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>
