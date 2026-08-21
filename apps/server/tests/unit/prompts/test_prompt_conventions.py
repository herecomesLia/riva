import ast
import re
from pathlib import Path

PROMPT_MODULES = Path(__file__).resolve().parents[3] / "src" / "riva" / "prompts"
VERSIONED_PROMPT_NAME = re.compile(r".*_PROMPT_V[0-9]+$")


def _assignment_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            names.update(
                target.id for target in targets if isinstance(target, ast.Name)
            )
    return names


def _prompt_definition_targets(tree: ast.Module) -> list[str]:
    targets: list[str] = []
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "PromptDefinition"
        ):
            continue
        targets.extend(
            target.id for target in node.targets if isinstance(target, ast.Name)
        )
    return targets


def test_prompt_modules_have_one_direct_canonical_definition() -> None:
    paths = sorted(
        path
        for path in PROMPT_MODULES.glob("*.py")
        if path.name not in {"base.py", "__init__.py"}
    )

    assert paths
    for path in paths:
        tree = ast.parse(path.read_text(), filename=str(path))
        assignments = _assignment_names(tree)
        definition_targets = _prompt_definition_targets(tree)
        canonical_name = f"{path.stem.upper()}_PROMPT"

        assert canonical_name in assignments, path
        assert not assignments & {
            name for name in assignments if VERSIONED_PROMPT_NAME.fullmatch(name)
        }, path
        assert definition_targets == [canonical_name], path
        assert not any(
            isinstance(node, ast.Attribute)
            and node.attr in {"system_template", "user_template"}
            for node in ast.walk(tree)
        ), path
