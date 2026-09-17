from collections.abc import Sequence
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from riva.ai.practice import PracticeRoundInput
from riva.llm import LLMClient
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeDimensionScores,
    PracticeQuestionTurn,
    PracticeResult,
)


def make_question(content: str = "Describe your project.") -> PracticeQuestionTurn:
    return PracticeQuestionTurn(
        id=uuid4(),
        content=content,
        guidance={
            "hints": ["Explain your contribution"],
            "framework": ["Context", "Action", "Result"],
        },
        criteria=[{"dimension": "Ownership", "expectation": "Identify your work"}],
        reference_answer="Describe the work you personally completed.",
    )


def make_answer(
    content: str = "I designed the cache.", *, id: UUID | None = None
) -> PracticeAnswerTurn:
    return PracticeAnswerTurn(id=id or uuid4(), content=content)


def make_dimension_scores(
    scores: dict[str, int] | None = None,
) -> PracticeDimensionScores:
    values = (
        scores
        if scores is not None
        else {name: 80 for name in PracticeDimensionScores.model_fields}
    )
    return PracticeDimensionScores.model_validate(
        {
            name: {"score": score, "explanation": f"Evidence for {name}"}
            for name, score in values.items()
        }
    )


def make_result() -> PracticeResult:
    return PracticeResult(
        score=80,
        dimension_scores=make_dimension_scores(),
        summary="Relevant answer with limited supporting evidence.",
        strengths=["Addresses the question"],
        issues=["Lacks outcome evidence"],
        suggestions=["Explain how the outcome was verified"],
    )


def make_input(*, max_follow_ups: int = 1) -> PracticeRoundInput:
    return PracticeRoundInput(
        profile={"skills": ["Python"]},
        role={
            "title": "Engineer",
            "company": "Original company",
            "jd": {"responsibilities": ["Build APIs"]},
        },
        question_type="project",
        difficulty="hard",
        max_follow_ups=max_follow_ups,
    )


class ScriptedPracticeModel:
    """Structured-output fake shared by in-memory and Postgres Agent tests."""

    def __init__(
        self,
        *,
        question: PracticeQuestionTurn | None = None,
        next_steps: Sequence[object] = (),
        evaluation: dict | None = None,
    ):
        self.question = question if question is not None else make_question()
        self.generate = AsyncMock(
            return_value=self.question.model_dump(mode="json", exclude={"id", "role"})
        )
        self.plan = AsyncMock(side_effect=next_steps)
        self.evaluate = AsyncMock(
            return_value=evaluation
            if evaluation is not None
            else make_result().model_dump(mode="json", exclude={"score"})
        )
        self.client = MagicMock(spec=LLMClient)
        self.client.chat_model.return_value.with_structured_output.side_effect = (
            self._structured_model
        )

    def _structured_model(self, schema: dict, **kwargs: object) -> RunnableLambda:
        invoke = {
            "_GeneratedQuestion": self.generate,
            "_NextStep": self.plan,
            "_EvaluationOutput": self.evaluate,
        }[schema["name"]]

        async def generate(messages):
            return {
                "raw": AIMessage(content="output"),
                "parsed": await invoke(messages),
                "parsing_error": None,
            }

        return RunnableLambda(generate)
