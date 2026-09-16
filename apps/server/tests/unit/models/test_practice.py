import pytest
from pydantic import ValidationError

from riva.models.practice import (
    PracticeDimension,
    PracticeDimensionScore,
    PracticeEvaluation,
)


@pytest.mark.parametrize("case", ["missing", "duplicate"])
def test_evaluation_requires_each_dimension_exactly_once(case: str) -> None:
    dimensions = [
        PracticeDimensionScore(dimension=dimension, score=70, explanation=["Evidence"])
        for dimension in PracticeDimension
    ]
    if case == "missing":
        dimensions.pop()
    else:
        dimensions[-1] = dimensions[0]

    with pytest.raises(ValidationError, match="each scoring dimension exactly once"):
        PracticeEvaluation(score=70, dimensions=dimensions)
