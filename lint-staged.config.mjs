const runApiGenerate = () => [
  "pnpm client:api:generate",
  "git add --all -- apps/client/src/api/generated",
]

export default {
  "*": "prettier --write --ignore-unknown",
  "apps/server/**/*.py": [
    "uv run --locked --directory apps/server ruff check --select I --fix",
    "uv run --locked --directory apps/server ruff format",
  ],
  "{apps/server/src/riva/**,apps/server/pyproject.toml,apps/server/uv.lock,apps/client/orval.config.ts,apps/client/package.json,pnpm-lock.yaml}":
    runApiGenerate,
}
