import type { Plugin } from "vite";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { readFileSync } from "fs";

interface VersionDetails {
  version: string;
  buildTime: string;
}

/**
 * Vite plugin that:
 * 1. Generates version.json at build time (for runtime version check)
 * 2. Injects APP_VERSION and APP_BUILD_TIME into the app
 *
 * Used for auto-reload when a new version is deployed (blue-green, etc.)
 */
export default function versionPlugin(): Plugin {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf-8")
  ) as { version: string };
  // Prefer VITE_APP_VERSION from env (Docker build-arg) so deployed version is correct
  const version =
    (process.env.VITE_APP_VERSION as string | undefined) || pkg.version;
  const buildTime = new Date().toISOString();
  const versionDetails: VersionDetails = {
    version,
    buildTime
  };

  return {
    name: "version-json",
    config() {
      return {
        define: {
          "import.meta.env.APP_VERSION": JSON.stringify(version),
          "import.meta.env.APP_BUILD_TIME": JSON.stringify(buildTime)
        }
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/version.json" || req.url === "/version.json?") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.end(JSON.stringify(versionDetails, null, 2));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const outDir = "dist";
      writeFileSync(
        resolve(process.cwd(), outDir, "version.json"),
        JSON.stringify(versionDetails, null, 2)
      );
    }
  };
}
