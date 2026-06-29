# RIVA

RIVA is a web-based AI Agent application.

## Project Structure

```text
riva/
  apps/
    client/      # Web client, based on React
    server/      # FastAPI Backend service
  packages/      # Independent reusable packages, only added when necessary
  docs/          # Product, architecture, and development documents
  scripts/       # Development and automation scripts
  infra/         # Deployment and infrastructure-related configuration
```

## Branch Strategy

This project uses separate long-lived branches for client and server development:

```text
main      # Stable integration branch
client    # Frontend development branch
server    # Backend development branch
```

Avoid developing directly on `main`. Use `main` as the stable integration branch.

## Package Managers

This project uses:

* `pnpm` for JavaScript / TypeScript workspace management
* `uv` for Python dependency and project management
