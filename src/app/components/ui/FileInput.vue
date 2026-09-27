<script setup lang="ts">
// file 输入：外框对齐标准输入框，内部「选择文件」按钮做成 btn-ink 风格（黑底纸色字）。
// accept / id / data-testid / @change 等全部透传到原生 input。
const fileInputClass = 'w-full cursor-pointer border-2 border-ink bg-surface px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 ' +
  'file:mr-3 file:cursor-pointer file:border-2 file:border-ink file:bg-ink file:px-3 file:py-1 file:text-sm file:font-extrabold file:text-paper hover:file:bg-accent-ink'
</script>

<template>
  <input type="file" :class="fileInputClass">
</template>
