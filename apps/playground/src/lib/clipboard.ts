import { onBeforeUnmount, ref } from 'vue'

/** Copies text and keeps `copied` true for a moment, for a "Copied" state on the button. */
export function useCopy() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // No clipboard API (plain http, old browsers): fall back to a selected textarea.
      const area = Object.assign(document.createElement('textarea'), { value: text })
      area.style.cssText = 'position:fixed;opacity:0'
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1500)
  }
  onBeforeUnmount(() => clearTimeout(timer))
  return { copied, copy }
}
