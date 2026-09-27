<script setup lang="ts">
// 标准下拉列表，样式与 BaseInput 一致；<option> 走默认插槽，data-testid 等属性透传。
defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <select
    :value="modelValue"
    class="w-full border-2 border-ink bg-surface px-3 py-2 disabled:opacity-60"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <slot />
  </select>
</template>
