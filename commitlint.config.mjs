// Prefer a short, single-line summary; add a body only when more detail is needed.
const TYPES = ["feat", "fix", "refactor", "test", "chore", "docs"]
const SCOPES = ["client", "server", "fullstack", "tooling"]

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "scope-required": ({ type, scope }) => [
          type === "docs" || Boolean(scope),
          "scope is required except for docs commits",
        ],
      },
    },
  ],
  rules: {
    "type-enum": [2, "always", TYPES],
    "scope-enum": [2, "always", SCOPES],
    "scope-required": [2, "always"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [2, "always"],
  },
}
