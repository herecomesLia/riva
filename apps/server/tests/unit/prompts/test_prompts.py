import pytest
from pydantic import BaseModel

from riva.prompts import (
    DuplicatePromptError,
    PromptDefinition,
    PromptRegistry,
    PromptRenderError,
)


class ExampleOutput(BaseModel):
    result: str


def example_prompt() -> PromptDefinition[ExampleOutput]:
    return PromptDefinition(
        prompt_id="example",
        version="1",
        system_template="You are a {role}.",
        user_template="Review {subject}.",
        output_schema_id="example-output-v1",
        output_schema=ExampleOutput,
    )


def test_prompt_renders_system_and_user_templates() -> None:
    rendered = example_prompt().render({"role": "reviewer", "subject": "candidate"})

    assert rendered.system == "You are a reviewer."
    assert rendered.user == "Review candidate."
    assert rendered.prompt_id == "example"
    assert rendered.version == "1"
    assert rendered.output_schema_id == "example-output-v1"


def test_prompt_render_fails_for_missing_variables() -> None:
    with pytest.raises(PromptRenderError, match="subject"):
        example_prompt().render({"role": "reviewer"})


def test_registry_rejects_duplicate_prompt_version() -> None:
    registry = PromptRegistry()
    registry.register(example_prompt())

    with pytest.raises(DuplicatePromptError, match="already registered"):
        registry.register(example_prompt())
