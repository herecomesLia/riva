# Riva server

## Tests

Run commands from `apps/server` using the existing `uv` environment. Pytest
markers support focused development runs without changing the default suite:

```bash
# Fast, isolated tests
pytest -m unit

# Functional tests, excluding explicitly long-running lifecycles
pytest -m "integration and not slow"

# Database migration coverage
pytest -m migration

# Agent evaluation framework and cases
pytest -m eval

# Complete suite
pytest
```

The complete suite remains the default and is intended for release validation
and CI. During development, use the narrowest applicable marker command.
