<script setup lang="ts">
// 标准多行文本框，样式与 BaseInput 一致；rows 等属性透传。
defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    :value="modelValue"
    class="w-full border-2 border-ink bg-surface px-3 py-2 disabled:opacity-60"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
