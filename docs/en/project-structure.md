# Project Structure

This document describes the intended structure of the Riva repository.

## Top-Level Layout

```text
riva/
├── apps/
│   ├── client/      # React web client
│   └── server/      # FastAPI backend service
├── packages/        # Shared reusable packages
│   └── contracts/   # API contracts used by the frontend and backend
├── docs/            # Product, architecture, and development documents
├── scripts/         # Development and automation scripts
└── infra/           # Deployment and infrastructure configuration
```

## Frontend Architecture

`apps/client/` is the Riva frontend application. It handles user interaction,
routing, and UI presentation.

Frontend directory structure:

```text
apps/client/
├── public/          # Static assets served by Vite
├── src/
│   ├── app/
│   ├── i18n/
│   ├── models/
│   ├── mocks/
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── routes/
│   ├── stores/
│   ├── styles/
│   ├── types/
│   └── assets/
├── package.json
├── vite.config.ts
└── tsconfig*.json
```

Layer responsibilities:

- `app/`: application bootstrap, providers, and app-wide configuration.
- `i18n/`: multilingual resources, localization configuration, language switching logic, and internationalized formatting for dates, numbers, and similar values.
- `models/`: frontend domain models, shared UI data shapes, and app-level type definitions.
- `mocks/`: page-state mocks and other frontend-only mock data used during early-stage UI development.
- `pages/`: screens mapped to application routes.
- `components/`: reusable UI sections and composed components.
- `hooks/`: React hooks that compose client state, service calls, and UI interaction flows.
- `services/`: API clients, Server-Sent Events streams, WebSocket connections,
  and upload clients.
- `routes/`: routing definitions.
- `stores/`: UI, session, and cache state.
- `styles/`: global styles, themes, and design tokens.
- `types/`: shared global types, environment types, and third-party declaration patches; domain-specific type declarations should stay beside their owning module.
- `assets/`: static assets imported by the app.

## Backend Architecture

`apps/server/` is the Riva FastAPI backend service.

Backend directory structure:

```text
apps/server/
├── pyproject.toml
├── uv.lock
├── src/
│   └── riva/
│       ├── api/
│       ├── cli/
│       ├── core/
│       ├── db/
│       ├── models/
│       ├── schemas/
│       ├── services/
│       ├── agents/
│       ├── workers/
│       ├── prompts/
│       └── integrations/
├── tests/
└── migrations/
```

Layer responsibilities:

- `api/`: FastAPI routes, request validation, and response handling.
- `cli/`: Typer command definitions and command-specific orchestration.
- `core/`: configuration, logging, auth dependencies, and lifecycle code.
- `db/`: database connections, transactions, and migration support.
- `models/`: database models, such as users, resumes, jobs, questions, interview
  sessions, reviews, and agent run records.
- `schemas/`: Pydantic request and response schemas.
- `services/`: business services for resumes, jobs, matching analysis, questions,
  interviews, and review scoring.
- `agents/`: agents and workflows.
- `workers/`: AgentRun handlers, registry, lease heartbeats, and queue execution.
- `prompts/`: prompt templates, scoring rubrics, and output formats.
- `integrations/`: adapters for LLM providers, object storage, email, and third-party APIs.
