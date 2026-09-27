import { ref, type Ref } from 'vue'

/** 宿主侧全屏控制：目标是整个游玩区（展柜 + 控制按钮）。
 *
 *  状态不自行置位——只认 document.fullscreenElement（fullscreenchange 事件驱动 sync），
 *  与浏览器真实状态严格一致（Esc 退出、他方抢占都能正确回落）。API 调用失败静默：
 *  全屏常要求用户手势，且各浏览器支持度不一，抛给调用方只会变成未处理拒绝。 */
export function useFullscreen() {
  const elRef: Ref<HTMLElement | null> = ref(null)
  const isFullscreen = ref(false)

  function attach(element: HTMLElement | null): void {
    elRef.value = element
  }

  function sync(): void {
    isFullscreen.value = document.fullscreenElement === elRef.value
  }

  async function enter(): Promise<void> {
    try {
      await elRef.value?.requestFullscreen?.()
    } catch { /* 静默：无用户手势 / 浏览器不支持 */ }
  }

  async function exit(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch { /* 静默 */ }
  }

  async function toggle(): Promise<void> {
    if (document.fullscreenElement === elRef.value) await exit()
    else await enter()
  }

  return { elRef, isFullscreen, attach, sync, enter, exit, toggle }
}
