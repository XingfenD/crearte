<script setup lang="ts">
// 全站按钮基座：外观由 main.css 的 .btn-ink / .btn-surface / .btn-sm / .lift 提供，
// 站点级微调（w-full、bg-highlight、ml-2 等）通过 class 透传叠加。
withDefaults(
  defineProps<{
    variant?: 'ink' | 'surface'
    size?: 'md' | 'sm'
    lift?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'surface', size: 'md', lift: false, type: 'button' }
)
</script>

<template>
  <button
    :type="type"
    :class="[variant === 'ink' ? 'btn-ink' : 'btn-surface', size === 'sm' && 'btn-sm', lift && 'lift']"
  >
    <slot />
  </button>
</template>
