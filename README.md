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

### Local API and Worker

Start PostgreSQL, initialize the schema, then run the API and Worker in
separate terminals:

```bash
podman compose -f infra/local/docker-compose.yml up -d postgres
uv run --directory apps/server riva db setup --env-file "$PWD/.env"
uv run --directory apps/server riva start --env-file "$PWD/.env"
uv run --directory apps/server riva worker --env-file "$PWD/.env"
```

Without `RIVA_LLM_PROVIDER`, the Worker starts with an empty handler registry.
With complete Qwen settings (`RIVA_LLM_PROVIDER=qwen`, model, API key, and base
URL), it registers `job-description-parser` and `matching-analyzer`; the
startup log then reports `handler_count=2`. The API already exposes the
job-description parsing lifecycle and the matching-analysis lifecycle. The
Worker registers both handlers. Frontend real-API integration will be completed
in a later step.

The API accepts TXT, PDF, DOCX, or pasted resume text through the three
resume-document endpoints under `/api/profile/resumes`. This step stores the
source and extracted text in `ResumeDocument`; it does not support legacy DOC,
encrypted PDF, or OCR. After parsing succeeds, the import lifecycle exposes a
reviewable draft and an explicit apply action:

- `GET /api/profile/resumes/{resumeId}/import-draft` returns the current draft;
- `POST /api/profile/resumes/{resumeId}/import-draft/apply` with
  `{"draftVersion": 1}` applies that exact draft version.

Draft retrieval never changes the profile, and applying an already applied
draft is idempotent. The existing `CareerProfile` GET endpoint remains the
source of truth for the resulting profile.

Default automated tests use a fake provider and never call Qwen. A real Qwen
check must be run explicitly by a developer with the required values in a
local `.env` file.
