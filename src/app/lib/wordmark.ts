const RANGE = 140
const REWIND_MS = 320

function wheelDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight
  return event.deltaY
}

export function setupWordmarkAssembly(el: HTMLElement): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  let progress = window.scrollY > 0 ? 1 : 0
  let locked = false
  let touchY = 0
  let frame = 0
  let rewinding = false

  function render(): void {
    el.style.setProperty('--wm-p', progress.toFixed(4))
  }

  function lock(): void {
    if (locked) return
    locked = true
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKeydown)
  }

  function unlock(): void {
    if (!locked) return
    locked = false
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('keydown', onKeydown)
  }

  function stopRewind(): void {
    if (!rewinding) return
    cancelAnimationFrame(frame)
    rewinding = false
    frame = 0
  }

  function advance(delta: number): void {
    stopRewind()
    progress = Math.min(1, Math.max(0, progress + delta / RANGE))
    render()
    if (progress === 1) unlock()
  }

  function rewind(): void {
    if (rewinding || progress === 0) {
      lock()
      return
    }
    lock()
    const from = progress
    const start = performance.now()
    rewinding = true
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / REWIND_MS)
      progress = from * (1 - t)
      render()
      if (t < 1) {
        frame = requestAnimationFrame(step)
      } else {
        rewinding = false
        frame = 0
      }
    }
    frame = requestAnimationFrame(step)
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    advance(wheelDelta(event))
  }

  function onTouchStart(event: TouchEvent): void {
    touchY = event.touches[0]?.clientY ?? 0
  }

  function onTouchMove(event: TouchEvent): void {
    const y = event.touches[0]?.clientY ?? touchY
    event.preventDefault()
    advance(touchY - y)
    touchY = y
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ' || event.key === 'End') {
      event.preventDefault()
      advance(RANGE / 2)
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
      event.preventDefault()
      advance(-RANGE / 2)
    }
  }

  function onScroll(): void {
    const y = window.scrollY
    if (!locked) {
      if (y <= 0) rewind()
      return
    }
    if (y <= 0) return
    advance(y)
    window.scrollTo(0, 0)
  }

  render()
  if (progress < 1) lock()
  window.addEventListener('scroll', onScroll)

  return () => {
    stopRewind()
    unlock()
    window.removeEventListener('scroll', onScroll)
  }
}
