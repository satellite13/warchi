import type { Ref } from 'vue'
import { onMounted, onUnmounted, ref } from 'vue'

const POLL_INTERVAL_MS = 60_000 // 1 минута

interface VersionInfo {
  version: string
  buildTime: string
}

/**
 * Периодически проверяет version.json на сервере.
 * При новой версии показывает информер; страницу не перезагружает автоматически —
 * пользователь обновляет вкладку сам (или кнопкой в toast).
 */
export function useVersionCheck(): {
  showNewVersionToast: Ref<boolean>
  newVersion: Ref<string>
  reloadToNewVersion: () => void
} {
  const showNewVersionToast = ref(false)
  const newVersion = ref('')
  let intervalId: ReturnType<typeof setInterval> | null = null

  const buildVersion = (import.meta.env.APP_VERSION as string | undefined) ?? ''
  const buildTime = (import.meta.env.APP_BUILD_TIME as string | undefined) ?? ''

  async function checkVersion(): Promise<void> {
    if (!buildVersion || showNewVersionToast.value) return

    try {
      const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || ''
      const prefix = base ? `${base}/` : '/'
      const url = `${prefix}version.json?t=${Date.now()}`
      const res = await fetch(url)
      if (!res.ok) return

      const data = (await res.json()) as VersionInfo
      if (data.version !== buildVersion || (data.buildTime && data.buildTime !== buildTime)) {
        showNewVersionToast.value = true
        newVersion.value = data.version
      }
    } catch {
      // Игнорируем ошибки сети — попробуем при следующей проверке
    }
  }

  const reloadToNewVersion = () => {
    window.location.reload()
  }

  onMounted(() => {
    if (import.meta.env.DEV) return // В dev-режиме не проверяем

    checkVersion()
    intervalId = setInterval(checkVersion, POLL_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  return { showNewVersionToast, newVersion, reloadToNewVersion }
}
