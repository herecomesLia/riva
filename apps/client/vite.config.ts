import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const mock = process.env.MOCK === "true"

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
    testTimeout: 10_000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
