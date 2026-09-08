from typing import Literal, Self, TypedDict, Unpack, get_args

from attrs import evolve, field, frozen
from attrs.validators import ge, gt, in_, optional

type LLMModelSlot = Literal["default", "reasoning"]
type LLMPolicyPreset = Literal["default"]
type LLMReasoningEffort = Literal[
    "none", "minimal", "low", "medium", "high", "xhigh", "max"
]


class LLMPolicyOverrides(TypedDict, total=False):
    model: LLMModelSlot
    request_timeout_seconds: float
    execution_timeout_seconds: float | None
    request_max_retries: int
    output_max_retries: int
    reasoning_effort: LLMReasoningEffort | None


@frozen(kw_only=True)
class LLMPolicy:
    """Immutable call policy with named presets."""

    model: LLMModelSlot = field(
        default="default", validator=in_(get_args(LLMModelSlot.__value__))
    )
    request_timeout_seconds: float = field(default=60, validator=gt(0))
    execution_timeout_seconds: float | None = field(
        default=None, validator=optional(gt(0))
    )
    request_max_retries: int = field(default=2, validator=ge(0))
    output_max_retries: int = field(default=0, validator=ge(0))
    reasoning_effort: LLMReasoningEffort | None = field(
        default=None,
        validator=optional(in_(get_args(LLMReasoningEffort.__value__))),
    )

    @staticmethod
    def preset(name: LLMPolicyPreset = "default") -> LLMPolicy:
        """Return an immutable named policy."""
        if name not in _PRESETS:
            raise ValueError(f"Unknown LLM policy preset: {name}")
        return _PRESETS[name]

    def override(self, **changes: Unpack[LLMPolicyOverrides]) -> Self:
        """Return a new policy with the supplied fields replaced."""
        return evolve(self, **changes)


_PRESETS: dict[LLMPolicyPreset, LLMPolicy] = {"default": LLMPolicy()}
