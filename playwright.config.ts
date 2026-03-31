import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // WebM recording without slowMo: slowMo breaks Page.screencast timestamps (choppy / wrong playback).
    {
      name: 'record',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
        video: {
          mode: 'on',
          size: { width: 1280, height: 720 },
        },
      },
      dependencies: ['setup'],
    },
    // Step-through debugging with CDP delay — no video (slowMo + screencast do not mix well).
    {
      name: 'slow-debug',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
        launchOptions: { slowMo: 800 },
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
