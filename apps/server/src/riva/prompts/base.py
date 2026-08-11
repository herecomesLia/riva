from collections.abc import Mapping
from dataclasses import dataclass
from string import Formatter
from typing import Generic, TypeVar

from pydantic import BaseModel
from typing_extensions import TypeForm


PromptOutputT = TypeVar("PromptOutputT", bound=BaseModel)
PromptKey = tuple[str, str]


class PromptError(RuntimeError):
    pass


class DuplicatePromptError(PromptError):
    pass


class PromptNotFoundError(PromptError):
    pass


class PromptRenderError(PromptError):
    pass


@dataclass(frozen=True)
class RenderedPrompt:
    prompt_id: str
    version: str
    system: str
    user: str
    output_schema_id: str


@dataclass(frozen=True)
class PromptDefinition(Generic[PromptOutputT]):
    prompt_id: str
    version: str
    system_template: str
    user_template: str
    output_schema_id: str
    output_schema: TypeForm[PromptOutputT]

    def __post_init__(self) -> None:
        for field_name in ("prompt_id", "version", "output_schema_id"):
            if not getattr(self, field_name).strip():
                raise ValueError(f"{field_name} must not be empty")

    @property
    def key(self) -> PromptKey:
        return self.prompt_id, self.version

    def render(self, values: Mapping[str, object]) -> RenderedPrompt:
        required = _template_fields(self.system_template) | _template_fields(
            self.user_template
        )
        missing = sorted(required - values.keys())
        if missing:
            names = ", ".join(missing)
            raise PromptRenderError(f"Missing prompt template variables: {names}")

        try:
            system = self.system_template.format_map(values)
            user = self.user_template.format_map(values)
        except (AttributeError, IndexError, KeyError, ValueError) as exc:
            raise PromptRenderError("Prompt template rendering failed.") from exc

        return RenderedPrompt(
            prompt_id=self.prompt_id,
            version=self.version,
            system=system,
            user=user,
            output_schema_id=self.output_schema_id,
        )


class PromptRegistry:
    def __init__(self) -> None:
        self._prompts: dict[PromptKey, PromptDefinition[BaseModel]] = {}

    def register(self, prompt: PromptDefinition[PromptOutputT]) -> None:
        if prompt.key in self._prompts:
            prompt_id, version = prompt.key
            raise DuplicatePromptError(
                f"Prompt {prompt_id!r} version {version!r} is already registered."
            )
        self._prompts[prompt.key] = prompt

    def get(self, prompt_id: str, version: str) -> PromptDefinition[BaseModel]:
        try:
            return self._prompts[(prompt_id, version)]
        except KeyError as exc:
            raise PromptNotFoundError(
                f"Prompt {prompt_id!r} version {version!r} is not registered."
            ) from exc


def _template_fields(template: str) -> set[str]:
    return {
        field_name.split(".", 1)[0].split("[", 1)[0]
        for _, field_name, _, _ in Formatter().parse(template)
        if field_name
    }
