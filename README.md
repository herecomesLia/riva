# RIVA

[简体中文](README.zh-CN.md) | English

RIVA is a web-based AI agent application.

## Documentation

- [Project structure](docs/en/project-structure.md)

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
