import json

import pytest

from riva.evals.runner import load_eval_cases


def _write_case(path, case_id: str) -> None:
    path.write_text(
        json.dumps(
            {
                "id": case_id,
                "agentId": "question-generator",
                "promptVersion": "2",
                "input": {},
                "assertions": [],
            }
        )
    )


def test_loader_accepts_single_file(tmp_path) -> None:
    file_path = tmp_path / "one.json"
    _write_case(file_path, "one")

    assert [case.id for case in load_eval_cases(file_path)] == ["one"]


def test_loader_recurses_and_sorts_files_stably(tmp_path) -> None:
    _write_case(tmp_path / "z.json", "z")
    nested = tmp_path / "nested"
    nested.mkdir()
    _write_case(nested / "b.json", "b")
    _write_case(nested / "a.json", "a")

    assert [case.id for case in load_eval_cases(tmp_path)] == ["a", "b", "z"]


def test_loader_rejects_malformed_json(tmp_path) -> None:
    path = tmp_path / "broken.json"
    path.write_text("{")

    with pytest.raises(ValueError, match="Malformed eval case JSON"):
        load_eval_cases(path)


def test_loader_rejects_duplicate_ids(tmp_path) -> None:
    _write_case(tmp_path / "a.json", "duplicate")
    _write_case(tmp_path / "b.json", "duplicate")

    with pytest.raises(ValueError, match="Duplicate eval case id"):
        load_eval_cases(tmp_path)


def test_loader_rejects_empty_directory(tmp_path) -> None:
    with pytest.raises(ValueError, match="empty"):
        load_eval_cases(tmp_path)
