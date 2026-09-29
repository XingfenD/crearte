<script setup lang="ts">
// 待审提交的内联试发展柜：把「提交 payload + bundle 上传」装配成 GameHost 的预览输入。
// 播放器（GameHost/useGameFrame）、安装链路（bootstrap/SW/agent）全部复用已发布作品的同一套，
// 本组件只负责两件预览态特有的事：密文/密钥端点指向带鉴权的上传 API，以及带上会话 token。
import { computed } from 'vue'
import GameHost from '../../runtime/host/GameHost.vue'
import { session } from '@/auth'
import { apiUrl, previewGame, uploadBundleKeyPath, uploadBundlePath, type PreviewSource } from '@/content'

const props = defineProps<{ source: PreviewSource }>()

const game = computed(() => {
  const { upload } = props.source
  return previewGame(props.source, apiUrl(uploadBundlePath(upload.id)))
})
const preview = computed(() => ({
  keyUrl: apiUrl(uploadBundleKeyPath(props.source.upload.id)),
  token: session.getToken() ?? undefined
}))
</script>

<template>
  <GameHost v-if="game" :game="game" :preview="preview" :show-exit="false" />
</template>
