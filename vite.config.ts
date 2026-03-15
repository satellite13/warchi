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
    plugins: [vue(), versionPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vue-vendor": ["vue", "vue-router", "vue-i18n"],
            papirus: ["@ngroznykh/papirus"],
            "md-editor": ["md-editor-v3"],
            "color-picker": ["@ckpack/vue-color"],
            marked: ["marked"]
          }
        }
      },
      chunkSizeWarningLimit: 900
    },
    test: {
      environment: "happy-dom",
    },
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:8080",
          changeOrigin: true
        }
      }
    }
  };
});
