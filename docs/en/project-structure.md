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

## Interaction Language Contract

RIVA's public language type is `InteractionLanguage`. Its only current values are
`zh-CN` and `en`, with `zh-CN` as the default. Frontend `SupportedLanguage` maps
one-to-one to it. All language normalization must use the shared helper; Resume,
Roles, Practice, and Interview modules must not define separate normalization rules.

The language source has three distinct layers:

- **UI language**: the current interface language, which can change at any time.
  Real API requests default to `Accept-Language` resolved from i18next at request
  time so the first request does not race language initialization.
- **Artifact language**: the language frozen for one Resume Parsing, JD Parsing,
  Matching Analysis, or future independent QuestionCard generation. It is captured
  from the UI language when the AgentRun is created and stored as
  `AgentRun.payload.interactionLanguage`; Workers restore it only from that payload.
  Future QuestionCard models must also expose `language: InteractionLanguage` explicitly;
  their language must never be inferred only from their text.
- **Session language**: the language frozen when a PracticeSession or
  InterviewSession is created. Session child operations (questions, follow-ups,
  scoring, reviews, and recommendations) inherit `Session.language` and never read
  the browser language again. UI chrome may change while AI content in the active
  Session remains unchanged.

Every new user-visible AI workflow must declare its language source in both design
and code: an independent artifact uses the AgentRun `interactionLanguage`, while a
Session child operation uses its owning Session's `language`. Do not use “detect the
primary language of the JD, resume, or answer” as the main output-language strategy.

Company, school, project, product, skill, programming-language, framework, database,
protocol, standard, and URL entities should remain in their original form where
practical. Translate surrounding natural-language descriptions without adding,
removing, or changing facts. Raw user resumes, raw JDs, user answers, and historical
AI artifacts are never silently translated when the UI language changes.
