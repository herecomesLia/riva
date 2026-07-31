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
docker compose -f infra/local/docker-compose.yml up -d postgres
uv run --directory apps/server riva db setup --env-file "$PWD/.env"
uv run --directory apps/server riva start --env-file "$PWD/.env"
uv run --directory apps/server riva worker --env-file "$PWD/.env"
```

The Worker currently has no business Agent handlers, so it only polls the
database queue. JD, matching, and resume handlers will be registered later.
