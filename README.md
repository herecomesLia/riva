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

Use `main` as the stable integration branch. Client, server, and documentation
work can use dedicated long-lived branches:

```text
main      stable integration
client    frontend development
server    backend development
docs      documentation
```

Daily changes should happen on task branches and merge back through the normal
review path.

Use `pnpm` for JavaScript and TypeScript packages, and `uv` for Python services.

### Local API

Start PostgreSQL, initialize the schema, then run the API:

```bash
podman compose -f infra/local/docker-compose.yml up -d postgres
uv run --directory apps/server riva db setup --env-file "$PWD/.env"
uv run --directory apps/server riva start --env-file "$PWD/.env"
```

The API invokes the current Agent synchronously and returns the persisted business
result after the LLM call completes. The frontend keeps request-level loading and
error feedback while a request is in progress; no queue or polling is required.

The API accepts TXT, PDF, DOCX, or pasted resume text through
`POST /api/profile/import/resume`. Resume data is read temporarily, converted
to a Profile content preview, and returned directly; no Resume document or
import draft is persisted. After reviewing the preview, the frontend saves it
through the ordinary `PUT /api/profile` endpoint with the Profile version from
the preceding GET request.

Default automated tests use a fake provider and never call Qwen. A real Qwen
check must be run explicitly by a developer with the required values in a
local `.env` file.
