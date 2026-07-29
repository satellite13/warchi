import { defineConfig, loadEnv, build as viteBuild, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";
import { writeFile } from "node:fs/promises";
import versionPlugin from "./vite-plugin-version";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPT_SANDBOX_ENTRY = path.resolve(
  __dirname,
  "src/features/validation-scripts/sandbox/scriptSandboxMain.ts"
);

async function buildScriptSandboxIife(): Promise<string> {
  const result = await viteBuild({
    configFile: false,
    logLevel: "error",
    build: {
      write: false,
      emptyOutDir: false,
      lib: {
        entry: SCRIPT_SANDBOX_ENTRY,
        name: "WarchiScriptSandbox",
        formats: ["iife"],
        fileName: () => "script-sandbox",
      },
      minify: true,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: "script-sandbox.js",
        },
      },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  for (const output of outputs) {
    if (!output || !("output" in output)) continue;
    for (const chunk of output.output) {
      if (chunk.type === "chunk" && chunk.isEntry && typeof chunk.code === "string") {
        return chunk.code;
      }
    }
  }
  throw new Error("script-sandbox IIFE build produced no entry chunk");
}

/**
 * Opaque sandboxed iframes (no allow-same-origin) treat CSP 'self' as the opaque
 * origin, so external /script-sandbox.js is blocked. Inline the IIFE instead.
 */
function renderScriptSandboxHtml(iifeCode: string): string {
  const safeCode = iifeCode.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>wArchi script sandbox</title>
  </head>
  <body>
    <script>${safeCode}</script>
  </body>
</html>
`;
}

function scriptSandboxIifePlugin(): Plugin {
  return {
    name: "script-sandbox-iife",
    configureServer(server) {
      // Before Vite static middleware so we override any stale public HTML.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/script-sandbox.html") {
          next();
          return;
        }
        try {
          const code = await buildScriptSandboxIife();
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(renderScriptSandboxHtml(code));
        } catch (err) {
          next(err);
        }
      });
    },
    async closeBundle() {
      const code = await buildScriptSandboxIife();
      await writeFile(
        path.resolve(__dirname, "dist/script-sandbox.html"),
        renderScriptSandboxHtml(code),
        "utf8"
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: "/",
    plugins: [vue(), versionPlugin(), scriptSandboxIifePlugin()],
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
      exclude: ["tests/**", "node_modules/**", ".worktrees/**"],
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
          changeOrigin: true,
          // Backend may set Domain=.arch.svc.cluster.local for k8s SSO; browsers
          // reject those cookies on localhost Vite, so strip Domain for local dev.
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes) => {
              const raw = proxyRes.headers["set-cookie"]
              if (!raw) return
              const cookies = Array.isArray(raw) ? raw : [raw]
              proxyRes.headers["set-cookie"] = cookies.map((cookie) =>
                cookie.replace(/;\s*Domain=[^;]*/gi, "")
              )
            })
          },
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
