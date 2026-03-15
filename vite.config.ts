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
          manualChunks(id) {
            if (id.includes("node_modules/vue") || id.includes("node_modules/@vue")) {
              return "vue-vendor";
            }
            if (id.includes("@ngroznykh/papirus")) {
              return "papirus";
            }
            if (id.includes("md-editor-v3")) {
              return "md-editor";
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
