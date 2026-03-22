import { computed, ref } from "vue"
import { buildApiUrl } from "@/api/config"

export type AvailabilityOutageKind = "backend_unavailable" | "authz_unavailable"

type AvailabilityOutageState = {
  kind: AvailabilityOutageKind
  message: string
  since: number
}

const outage = ref<AvailabilityOutageState | null>(null)
const isRetrying = ref(false)

let retryTimer: number | null = null
const RETRY_INTERVAL_MS = 4000

function clearRetryTimer() {
  if (retryTimer !== null) {
    window.clearInterval(retryTimer)
    retryTimer = null
  }
}

async function pingBackend(): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl("/system/version"), {
      method: "GET",
      headers: { Accept: "application/json" },
    })
    return response.ok
  } catch {
    return false
  }
}

function startAutoRetry() {
  if (typeof window === "undefined" || retryTimer !== null) return
  retryTimer = window.setInterval(async () => {
    isRetrying.value = true
    const ok = await pingBackend()
    isRetrying.value = false
    if (ok) {
      clearOutage()
    }
  }, RETRY_INTERVAL_MS)
}

export function reportAvailabilityOutage(kind: AvailabilityOutageKind, message: string) {
  const next: AvailabilityOutageState = {
    kind,
    message,
    since: Date.now(),
  }
  const current = outage.value
  // authz outage is more specific than generic backend outage.
  if (current?.kind === "authz_unavailable" && kind === "backend_unavailable") {
    startAutoRetry()
    return
  }
  outage.value = next
  startAutoRetry()
}

export function clearOutage() {
  outage.value = null
  isRetrying.value = false
  clearRetryTimer()
}

export async function retryNow(): Promise<boolean> {
  isRetrying.value = true
  const ok = await pingBackend()
  isRetrying.value = false
  if (ok) {
    clearOutage()
  } else {
    startAutoRetry()
  }
  return ok
}

export function useAvailabilityGuard() {
  const isOutage = computed(() => outage.value !== null)
  return {
    outage,
    isOutage,
    isRetrying,
    retryNow,
  }
}
