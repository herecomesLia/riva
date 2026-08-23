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
│       └── integrations/
└── tests/
```

The server keeps the HTTP entry points and domain workflows grouped by product
area. Cross-cutting API composition stays at the API root:

```text
src/riva/
├── api/
│   ├── auth.py        # authentication and account routes
│   ├── dashboard.py   # dashboard routes
│   ├── health.py      # health routes
│   ├── interview.py   # interview routes
│   ├── jobs.py        # role and job-description routes
│   ├── practice.py    # practice session and question routes
│   ├── profile.py     # profile routes
│   ├── resumes.py     # resume routes
│   ├── training.py    # training, competency, and record routes
│   ├── dependencies.py
│   ├── errors.py
│   ├── cookies.py
│   └── routes.py      # router composition only
├── services/
│   ├── auth.py
│   ├── profile/
│   ├── resumes/
│   ├── jobs/
│   ├── practice/
│   ├── interview/
│   ├── training/
│   └── dashboard/
└── integrations/
    ├── llm/
    └── storage/
```

Layer responsibilities:

- `api/`: one FastAPI route module per business domain. Cross-cutting dependency injection,
  error mapping, cookies, and router composition stay in the API root modules.
- `cli/`: Typer command definitions and command-specific orchestration.
- `core/`: configuration, logging, security, language helpers, and application lifecycle.
- `db/`: database connections, transactions, and model-managed schema operations.
- `models/`: database models, such as users, resumes, jobs, questions, interview
  sessions, reviews, and business result records.
- `schemas/`: Pydantic HTTP request and response contracts only.
- `services/`: domain services grouped under `profile/`, `resumes/`, `jobs/`,
  `practice/`, `interview/`, `training/`, and `dashboard/`; the compact auth
  service stays in `auth.py`. Service inputs and projections use the plain
  Pydantic models kept beside each domain service, not HTTP schemas.
- `agents/`: Agent implementations grouped by domain, with every domain in a
  local package and its internal
  input/output contracts, prompts, and validation kept next to the Agent.
- `integrations/`: external adapters under `llm/` and `storage/`; services and
  Agents depend on their abstractions rather than transport implementations.

The intended dependency direction is `api -> services -> agents/integrations/db`.
Services do not import FastAPI, Starlette, API errors, cookies, or `riva.schemas`;
the API translates HTTP contracts into domain inputs, maps domain errors to HTTP,
and serializes domain results back into response contracts.

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
  from the UI language when the Agent is invoked and stored with the resulting
  business artifact; the Agent receives it directly from the service.
  Future QuestionCard models must also expose `language: InteractionLanguage` explicitly;
  their language must never be inferred only from their text.
- **Session language**: the language frozen when a PracticeSession or
  InterviewSession is created. Session child operations (questions, follow-ups,
  scoring, reviews, and recommendations) inherit `Session.language` and never read
  the browser language again. UI chrome may change while AI content in the active
  Session remains unchanged.

Every new user-visible AI workflow must declare its language source in both design
and code: an independent artifact uses the Agent invocation's `interactionLanguage`,
while a Session child operation uses its owning Session's `language`. Do not use “detect the
primary language of the JD, resume, or answer” as the main output-language strategy.

Company, school, project, product, skill, programming-language, framework, database,
protocol, standard, and URL entities should remain in their original form where
practical. Translate surrounding natural-language descriptions without adding,
removing, or changing facts. Raw user resumes, raw JDs, user answers, and historical
AI artifacts are never silently translated when the UI language changes.
