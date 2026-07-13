import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";
import versionPlugin from "./vite-plugin-version";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: "/",
    plugins: [vue(), versionPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/vue") || id.includes("node_modules/@vue")) {
              return "vue-vendor";
            }
            if (id.includes("@ngroznykh/papirus")) {
              return "papirus";
            }
            if (id.includes("md-editor-v3")) {
              return "md-editor-lib";
            }
            if (id.includes("@ckpack/vue-color")) {
              return "color-picker";
            }
            if (id.includes("node_modules/marked")) {
              return "marked";
            }
            return undefined;
          }
        }
      },
      chunkSizeWarningLimit: 900
    },
    test: {
      environment: "happy-dom",
      setupFiles: ["./src/test/setup.ts"],
      exclude: ["tests/**", "node_modules/**"],
      coverage: {
        provider: "v8",
        include: [
          "src/composables/**/*.{ts,vue}",
          "src/api/**/*.{ts,vue}",
          "src/features/models/utils/**/*.{ts,vue}",
        ],
        exclude: [
          "src/**/*.test.ts",
          "src/**/*.d.ts",
          "src/test/**",
          "src/main.ts",
          "src/i18n/**",
          "src/router/**",
          "src/env.d.ts",
        ],
        reporter: ["text", "html"],
        thresholds: {
          lines: 40,
          functions: 40,
          branches: 30,
          statements: 40,
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:8080",
          changeOrigin: true
        },
        "/ws": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:8080",
          ws: true,
          changeOrigin: true
        }
      }
    }
  };
});
