import type { Ref } from "vue";
import { onMounted, onUnmounted, ref } from "vue";

const POLL_INTERVAL_MS = 60_000; // 1 минута
const TOAST_DELAY_MS = 2_500; // Показать toast перед перезагрузкой

interface VersionInfo {
  version: string;
  buildTime: string;
}

/**
 * Периодически проверяет version.json на сервере.
 * При обнаружении новой версии показывает toast и через 2.5 сек перезагружает страницу.
 */
export function useVersionCheck(): {
  showNewVersionToast: Ref<boolean>;
  newVersion: Ref<string>;
} {
  const showNewVersionToast = ref(false);
  const newVersion = ref("");
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let reloadTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const buildVersion =
    (import.meta.env.APP_VERSION as string | undefined) ?? "";
  const buildTime =
    (import.meta.env.APP_BUILD_TIME as string | undefined) ?? "";

  async function checkVersion(): Promise<void> {
    if (!buildVersion) return;

    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || "";
      const prefix = base ? `${base}/` : "/";
      const url = `${prefix}version.json?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = (await res.json()) as VersionInfo;
      if (
        data.version !== buildVersion ||
        (data.buildTime && data.buildTime !== buildTime)
      ) {
        showNewVersionToast.value = true;
        newVersion.value = data.version;
        reloadTimeoutId = setTimeout(() => {
          window.location.reload();
        }, TOAST_DELAY_MS);
      }
    } catch {
      // Игнорируем ошибки сети — попробуем при следующей проверке
    }
  }

  onMounted(() => {
    if (import.meta.env.DEV) return; // В dev-режиме не проверяем

    checkVersion();
    intervalId = setInterval(checkVersion, POLL_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (reloadTimeoutId) {
      clearTimeout(reloadTimeoutId);
      reloadTimeoutId = null;
    }
  });

  return { showNewVersionToast, newVersion };
}
