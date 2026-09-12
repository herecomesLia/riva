import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { defineConfig } from "orval"

const serverDirectory = fileURLToPath(new URL("../server", import.meta.url))
const openapiDocument = JSON.parse(
  execFileSync("uv", ["run", "--locked", "--directory", serverDirectory, "riva", "openapi"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
)

export default defineConfig({
  riva: {
    input: {
      target: openapiDocument,
    },
    output: {
      mode: "tags-split",
      client: "axios",
      target: fileURLToPath(new URL("./src/api/generated/endpoints", import.meta.url)),
      schemas: fileURLToPath(new URL("./src/api/generated/models", import.meta.url)),
      tsconfig: { compilerOptions: { target: "es2023" } },
      clean: true,
      indexFiles: true,
      tagsSplitDeduplication: true,
      formatter: "prettier",
      override: {
        title: (title) => `${title}Api`,
        mutator: {
          path: fileURLToPath(new URL("./src/api/http.ts", import.meta.url)),
          name: "request",
        },
      },
      mock: {
        indexMockFiles: false,
        generators: [
          {
            type: "msw",
          },
          {
            type: "faker",
            schemas: true,
          },
        ],
      },
    },
  },
})
