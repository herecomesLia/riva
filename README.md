# Riva

[简体中文](README.zh-CN.md) | English

Riva is a web-based AI interview training assistant for job seekers.

It helps users prepare for target roles by combining resume context, job
description understanding, personalized interview question cards, targeted
practice, mock interviews, scoring, reviews, and follow-up training
recommendations.

## Product Scope

Riva focuses on five product areas:

- **User foundation**: resumes, education, work experience, project experience,
  skill tags, target roles, and job search direction.
- **Job understanding and matching**: JD parsing, capability extraction, keyword
  analysis, and resume-to-role matching reports.
- **Interview training capabilities**: personalized question cards,
  single-question practice, dynamic follow-up questions, scoring, and reviews.
- **Training modes**: targeted practice for rapid single-question improvement
  and mock interviews for continuous multi-question rehearsal.
- **Records and recommendations**: answer history, scores, reviews, weak areas,
  saved questions, and next-step training suggestions.

## Documentation

- [Product Requirements](docs/en/product-requirements.md)
- [Project Structure](docs/en/project-structure.md)

## Development

Riva is a pnpm and uv monorepo. Run the following commands from the repository
root unless noted otherwise.

### Prerequisites

- pnpm 11
- uv and Python 3.14 or newer
- Podman or Docker when running the server or server integration tests

Install the workspace dependencies:

```bash
pnpm install
uv sync --locked --directory apps/server
```

### Client development

The client currently uses its mock services for day-to-day UI development:

```bash
pnpm client:dev:mock
```

Vite serves the client at `http://localhost:5173`. Use `pnpm client:dev` when
working against implemented server APIs.

### Server development

Create a local environment file and apply the local-development cookie and CORS
values documented in it:

```bash
cp .env.example .env
```

Start PostgreSQL:

```bash
podman compose -f infra/local/docker-compose.yml up -d
```

Docker users can replace `podman compose` with `docker compose`.

Create the database tables, then start the FastAPI server with source reload:

```bash
uv run --locked --directory apps/server riva db setup --env-file ../../.env -y
uv run --locked --directory apps/server riva start --env-file ../../.env --reload
```

The API listens on `http://127.0.0.1:7482` by default. Stop the local database
when it is no longer needed:

```bash
podman compose -f infra/local/docker-compose.yml down
```

### Tests and checks

Run the relevant checks before submitting a change:

```bash
pnpm client:lint
pnpm client:test
pnpm server:test
pnpm format:check
```

Server tests use Testcontainers to create and remove a temporary PostgreSQL
instance automatically. A Docker-compatible container runtime must be available,
but the local development database does not need to be running.
