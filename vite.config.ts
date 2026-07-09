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
      exclude: ["tests/**", "node_modules/**"],
      coverage: {
        provider: "istanbul",
        reporter: ["text", "html", "lcov", "json"],
        include: ["src/**/*.{ts,vue}"],
        exclude: [
          "src/**/*.test.ts",
          "src/**/*.spec.ts",
          "src/**/*.d.ts",
          "src/test/**",
          "src/main.ts",
          "src/i18n/**",
          "src/router/**",
          "src/env.d.ts",
          "src/views/**/*.vue",
          "src/layouts/**/*.vue",
          "src/components/**/*.vue",
          "src/features/**/components/**/*.vue",
          "src/features/**/*.vue",
          "src/config/**/*.generated.ts",
          "src/config/mdEditor.ts",
          "src/types/**/*.ts",
          "src/api/config.ts",
          "src/composables/useApi.ts",
          "src/features/docs/**/*.ts",
          "src/features/models/composables/index.ts",
          "src/features/models/composables/useAutoVersionCheck.ts",
          "src/features/models/composables/useModelComparisonDiff.ts",
          "src/features/models/composables/useModelVersionDiff.ts",
          "src/features/models/composables/useSavePipeline.ts",
          "src/features/models/composables/liveTimeCollab.ts",
          "src/features/models/composables/useDiagramExport.ts",
          "src/features/models/composables/useDocumentModal.ts",
          "src/features/models/composables/useEditorLoadModel.ts",
          "src/features/models/composables/useRelationsApi.ts",
          "src/features/models/composables/useModelLiveSync.ts",
          "src/features/models/composables/useNoteEditor.ts",
          "src/features/models/composables/useModulesLoader.ts",
          "src/features/models/utils/modelSyncTelemetry.ts",
          "src/features/models-matrix/utils/buildRelationMatrixCsv.ts",
          "src/features/models-matrix/utils/buildRelationMatrixPng.ts",
          "src/features/models-matrix/composables/useMatrixData.ts",
          "src/features/notations/composables/useCustomProperties.ts",
          "src/features/notations/composables/useNotationDiagram.ts",
          "src/features/notations/composables/useNotationEditor.ts",
          "src/features/notations/composables/useNotationStyles.ts",
          "src/features/notations/composables/useNotationEntity.ts",
          "src/features/notations/composables/useNotationExport.ts",
          "src/features/notations/composables/useNotationImportApi.ts",
          "src/features/notations/composables/useNotationToolbarState.ts",
          "src/features/notations/composables/useRelationRulesSync.ts",
          "src/features/notations/utils/notationAttrsJson.ts",
          "src/features/notations/utils/compositeNewTypes.ts",
          "src/features/shapes/**/*.ts",
          "src/features/shapes/**/*.vue",
          "src/features/types/**/*.ts",
          "src/features/types/**/*.vue",
          "src/features/notations/styles/**/*.ts",
          "src/features/notations/types/**/*.ts",
          "src/views/composables/**/*.ts",
          "src/composables/useAvailabilityGuard.ts",
          "**/types.ts",
          "src/composables/useActivityFormatting.ts",
          "src/composables/useResizablePropsPanel.ts",
          "src/composables/useVersionCheck.ts",
          "src/composables/useWikiDocuments.ts",
          "src/features/models/composables/useDiagramEditLock.ts",
          "src/features/models/composables/modelEditorLoadModel.ts",
          "src/features/models/composables/modelEditorSavePipeline.ts",
          "src/features/models/composables/modelNotationRelationsApi.ts",
          "src/features/models/composables/useComparisonDiff.ts",
          "src/features/models/composables/useDiagramRealtimeCollab.ts",
          "src/features/models/composables/useModelDiagramExport.ts",
          "src/features/models/composables/useModelLiveSync.ts",
          "src/features/models/composables/useNotationRelationsAndRulesLoader.ts",
          "src/features/models/utils/batchSaveConflictDisplay.ts",
          "src/features/models/utils/diagramScopedProperties.ts",
          "src/features/models/utils/diagramViewportPersistence.ts",
          "src/features/models/utils/mergeLocalCustomPropsAfterReload.ts",
          "src/features/models/utils/modelSyncTelemetry.ts",
          "src/features/models/utils/sanitizeDiagramInstances.ts",
          "src/features/models-matrix/composables/useRelationMatrixData.ts",
          "src/features/models-matrix/utils/relationMatrixCsv.ts",
          "src/features/models-matrix/utils/relationMatrixPng.ts",
          "src/features/notations/composables/useComponentStyleState.ts",
          "src/features/notations/composables/useRelationStyleState.ts",
          "src/features/notations/composables/useNotationImportApi.ts",
          "src/features/notations/composables/useNotationToolbarState.ts",
          "src/features/notations/composables/useRelationRulesSync.ts",
          "src/features/notations/utils/compositeNewTypes.ts",
          "src/utils/getModelEntityPosition.ts",
          "src/utils/buildModelEntityError.ts",
        ],
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
