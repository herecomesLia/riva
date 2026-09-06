import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const mock = process.env.MOCK === "true"
const chromiumExecutablePath = process.env.CHROMIUM_BIN
const storybookBrowserProvider = playwright(
  chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {},
)

function mswWorkerPlugin(): Plugin {
  const worker = readFileSync(fileURLToPath(import.meta.resolve("msw/mockServiceWorker.js")))

  return {
    name: "riva-msw-worker",

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/mockServiceWorker.js") {
          return next()
        }

        response.setHeader("Content-Type", "text/javascript; charset=utf-8")
        response.setHeader("Cache-Control", "no-cache")
        response.end(worker)
      })
    },

    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "mockServiceWorker.js",
        source: worker,
      })
    },
  }
}

export default defineConfig({
  define: {
    "import.meta.env.MOCK": JSON.stringify(process.env.MOCK ?? ""),
  },
  plugins: [react(), tailwindcss(), mock && mswWorkerPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.RIVA_API_PROXY_TARGET ?? "http://localhost:7482",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          testTimeout: 10_000,
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        },
      },
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.resolve(dirname, ".storybook") })],
        test: {
          name: "storybook",
          setupFiles: [
            path.resolve(dirname, "src/test/setup.ts"),
            path.resolve(dirname, ".storybook/vitest.setup.ts"),
          ],
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: storybookBrowserProvider,
          },
        },
      },
    ],
  },
})
