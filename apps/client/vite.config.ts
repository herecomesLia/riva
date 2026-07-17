import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  define: {
    "import.meta.env.MOCK": JSON.stringify(process.env.MOCK ?? ""),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    projects: [
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: "@/app/env",
              replacement: path.resolve(dirname, "src/test/env/unit.ts"),
            },
          ],
        },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: [
            "src/**/*.api.test.ts",
            "src/**/*.api.test.tsx",
            "src/**/*.mock.test.ts",
            "src/**/*.mock.test.tsx",
            "src/**/*.stories.*",
          ],
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: "@/app/env",
              replacement: path.resolve(dirname, "src/test/env/api.ts"),
            },
          ],
        },
        test: {
          name: "api",
          include: ["src/**/*.api.test.ts", "src/**/*.api.test.tsx"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: "@/app/env",
              replacement: path.resolve(dirname, "src/test/env/mock.ts"),
            },
          ],
        },
        test: {
          name: "mock",
          include: ["src/**/*.mock.test.ts", "src/**/*.mock.test.tsx"],
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
            provider: playwright({}),
          },
        },
      },
    ],
  },
})
