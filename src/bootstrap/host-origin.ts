/** bootstrap 页向父级宿主演报信号时的目标 origin 解析。
 *
 *  优先级：构建期环境变量 VITE_HOST_ORIGIN > document.referrer 的 origin > 内置默认值。
 *  referrer 回退的意义：环境变量缺失或配错时（曾因宿主机误构建 dist 触发过），
 *  若死扛默认值，bootstrap 的所有 postMessage 都会被浏览器静默拒绝，
 *  父级收不到任何信号 → 60s 超时才失败。iframe 首次导航的来源即宿主页，
 *  referrer 本身就是正确答案。父侧仍严格校验 event.origin === 作品 origin，
 *  本回退不削弱安全模型，只是让信号链路不再静默死亡。 */
export const DEFAULT_HOST_ORIGIN = 'https://games.example.com'

export function resolveHostOrigin(envOrigin: string | undefined, referrer: string): string {
  if (envOrigin) return envOrigin
  try {
    if (referrer) return new URL(referrer).origin
  } catch {
    /* referrer 不可解析：落默认值 */
  }
  return DEFAULT_HOST_ORIGIN
}
