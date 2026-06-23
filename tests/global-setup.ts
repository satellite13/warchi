import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { FullConfig } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Runs after Vite (webServer) is up. Seeds the E2E user via the same origin as tests
 * so requests go through the dev proxy (VITE_API_PROXY_TARGET), not only :8080.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.E2E_SEED_SKIP === "true") {
    console.log("[e2e] globalSetup: skip seed (E2E_SEED_SKIP=true)")
    return
  }

  // On CI, seed directly against the backend (localhost:8080).
  // Do NOT inherit E2E_API_URL — it contains a K8s hostname like "backend"
  // that doesn't resolve inside the Docker-in-Docker test container.
  // Only inherit the explicit E2E_API_BASE_URL if provided, otherwise default
  // to the backend bound to the Jenkins host (reachable via --network host).
  if (process.env.CI) {
    const script = path.resolve(__dirname, "../scripts/seed-e2e-user.mjs")
    const apiBase = process.env.E2E_API_BASE_URL || "http://localhost:8080/api/v1"
    const ciEnv = {
      ...process.env,
      E2E_API_URL: "",               // clear Jenkins K8s hostname
      E2E_API_BASE_URL: apiBase,     // explicit URL
    }
    execFileSync(process.execPath, [script], {
      env: ciEnv,
      stdio: "inherit",
    })
    return
  }

  const baseFromConfig = typeof config.use?.baseURL === "string" ? config.use.baseURL.replace(/\/$/, "") : ""
  const baseURL = baseFromConfig || "http://localhost:5173"
  const apiBase = process.env.E2E_API_BASE_URL || `${baseURL}/api/v1`

  const script = path.resolve(__dirname, "../scripts/seed-e2e-user.mjs")
  execFileSync(process.execPath, [script], {
    env: { ...process.env, E2E_API_BASE_URL: apiBase },
    stdio: "inherit",
  })
}
