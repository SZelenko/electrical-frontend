import { computed, onScopeDispose, ref } from 'vue'

/** Counts down whole seconds from `start(n)` to 0. */
export function useCountdown() {
  const remaining = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  function stop() {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  function start(seconds: number) {
    stop()
    remaining.value = seconds
    timer = setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0) {
        remaining.value = 0
        stop()
      }
    }, 1000)
  }

  onScopeDispose(stop)
  return { remaining, active: computed(() => remaining.value > 0), start }
}
