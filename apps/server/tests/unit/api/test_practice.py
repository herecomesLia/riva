import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest
from riva.core.auth import get_auth_service, require_current_user
from riva.core.practice import get_practice_api_service
from riva.models import User
from riva.schemas.practice_sessions import (
    CompletePracticeSessionRequest,
    ContinuePracticeQuestionRequest,
    CurrentPracticeSessionResponse,
    EndPracticeFollowUpsRequest,
    EndPracticeSessionEarlyRequest,
    PracticeAnswerResponse,
    PracticeCompletedSessionResponse,
    PracticeEvaluatingResponse,
    PracticeFollowUpQuestionResponse,
    PracticeGeneratingFollowUpResponse,
    PracticeGeneratingQuestionResponse,
    RefreshPracticeEvaluationRequest,
    RevealPracticeFollowUpGuidanceRequest,
    RevealPracticeQuestionGuidanceRequest,
    RetryPracticeQuestionRequest,
    PracticeSessionSelection,
    SetPracticeQuestionSavedRequest,
    SetPracticeQuestionWeakRequest,
)


TRUSTED_ORIGIN = "http://localhost:5173"
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")


def user() -> User:
    return User(
        id=uuid4(),
        username="practice-api",
        normalized_username="practice-api",
        password_hash="hash",
        display_name="Practice API",
    )


def selection() -> PracticeSessionSelection:
    return PracticeSessionSelection(
        target_role_id=uuid4(),
        question_type="projectDeepDive",
        difficulty="basic",
        source="personalized",
        prioritize_weaknesses=False,
    )


def response() -> PracticeGeneratingQuestionResponse:
    return PracticeGeneratingQuestionResponse(
        status="generatingQuestion",
        session_id=SESSION_ID,
        language="zh-CN",
        version=1,
        selection=selection(),
        started_at=datetime(2026, 8, 11, 12, 0, tzinfo=UTC),
        attempt_id=uuid4(),
        attempt_number=1,
    )


def follow_up_response() -> PracticeGeneratingFollowUpResponse:
    return PracticeGeneratingFollowUpResponse(
        status="generatingFollowUp",
        session_id=SESSION_ID,
        language="zh-CN",
        version=3,
        selection=selection(),
        started_at=datetime(2026, 8, 11, 12, 0, tzinfo=UTC),
        attempt_id=uuid4(),
        attempt_number=1,
        question={
            "id": uuid4(),
            "prompt": "Tell me about a project.",
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "assessedCapabilities": ["Ownership"],
            "recommendedMaterials": [],
            "isSaved": False,
            "isMarkedWeak": False,
        },
        main_answer=PracticeAnswerResponse(
            id=uuid4(),
            content="My answer",
            created_at=datetime(2026, 8, 11, 12, 1, tzinfo=UTC),
            order=1,
        ),
        follow_up_exchanges=[],
    )


def end_follow_up_response() -> PracticeEvaluatingResponse:
    generated = follow_up_response()
    return PracticeEvaluatingResponse(
        status="evaluating",
        session_id=generated.session_id,
        language=generated.language,
        version=generated.version + 1,
        selection=generated.selection,
        started_at=generated.started_at,
        attempt_id=generated.attempt_id,
        attempt_number=generated.attempt_number,
        question=generated.question,
        main_answer=generated.main_answer,
        follow_up_exchanges=[],
        follow_up_completion={
            "status": "endedEarly",
            "unansweredQuestion": PracticeFollowUpQuestionResponse(
                id=uuid4(),
                prompt="What metric changed?",
                created_at=datetime(2026, 8, 11, 12, 2, tzinfo=UTC),
                order=1,
            ),
        },
        submitted_at=datetime(2026, 8, 11, 12, 3, tzinfo=UTC),
    )


def completed_response() -> PracticeCompletedSessionResponse:
    return PracticeCompletedSessionResponse(
        status="completed",
        session_id=SESSION_ID,
        language="en",
        version=6,
        selection=selection(),
        started_at=datetime(2026, 8, 11, 12, 0, tzinfo=UTC),
        attempt_id=uuid4(),
        attempt_number=1,
        completion_reason="reviewCompleted",
        completed_at=datetime(2026, 8, 11, 12, 5, tzinfo=UTC),
        questions_completed=1,
        retry_count=0,
        saved_question_count=0,
        marked_weak_question_count=0,
        final_attempt_average_score=82,
        next_step_suggestion="Move to the next focused question.",
        unfinished_attempt=None,
    )


class FakePracticeAPIService:
    def __init__(self) -> None:
        self.result = response()
        self.submit_result = follow_up_response()
        self.end_follow_up_result = end_follow_up_response()
        self.refresh_follow_up_result = self.submit_result
        self.refresh_evaluation_result = self.result
        self.completed_result = completed_response()
        self.completed_get_result = self.result
        self.current_result = CurrentPracticeSessionResponse(session=self.result)
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def start_session(self, **kwargs: object):
        self.calls.append(("start", kwargs))
        return self.result

    async def refresh_question_generation(self, **kwargs: object):
        self.calls.append(("refresh", kwargs))
        return self.result

    async def continue_to_next_question(self, **kwargs: object):
        self.calls.append(("continue", kwargs))
        return self.result

    async def retry_current_question(self, **kwargs: object):
        self.calls.append(("retry", kwargs))
        return self.submit_result

    async def set_question_saved(self, **kwargs: object):
        self.calls.append(("set_saved", kwargs))
        return self.submit_result

    async def set_question_weak(self, **kwargs: object):
        self.calls.append(("set_weak", kwargs))
        return self.submit_result

    async def reveal_question_hint(self, **kwargs: object):
        self.calls.append(("reveal_hint", kwargs))
        return self.submit_result

    async def reveal_question_framework(self, **kwargs: object):
        self.calls.append(("reveal_framework", kwargs))
        return self.submit_result

    async def reveal_follow_up_hint(self, **kwargs: object):
        self.calls.append(("reveal_follow_up_hint", kwargs))
        return self.submit_result

    async def reveal_follow_up_framework(self, **kwargs: object):
        self.calls.append(("reveal_follow_up_framework", kwargs))
        return self.submit_result

    async def submit_primary_answer(self, **kwargs: object):
        self.calls.append(("submit", kwargs))
        return self.submit_result

    async def submit_follow_up_answer(self, **kwargs: object):
        self.calls.append(("submit_follow_up", kwargs))
        return self.submit_result

    async def end_follow_ups(self, **kwargs: object):
        self.calls.append(("end_follow_ups", kwargs))
        return self.end_follow_up_result

    async def refresh_follow_up_generation(self, **kwargs: object):
        self.calls.append(("refresh_follow_up", kwargs))
        return self.refresh_follow_up_result

    async def refresh_evaluation(self, **kwargs: object):
        self.calls.append(("refresh_evaluation", kwargs))
        return self.refresh_evaluation_result

    async def get_session(self, **kwargs: object):
        self.calls.append(("get", kwargs))
        return self.completed_get_result

    async def complete_session(self, **kwargs: object):
        self.calls.append(("complete", kwargs))
        return self.completed_result

    async def end_session_early(self, **kwargs: object):
        self.calls.append(("end", kwargs))
        return self.completed_result

    async def get_current_session(self, **kwargs: object):
        self.calls.append(("current", kwargs))
        return self.current_result


def request(app, method: str, path: str, **kwargs: object) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def install_service(app, service: FakePracticeAPIService, current_user: User) -> None:
    async def get_user() -> User:
        return current_user

    async def get_service() -> FakePracticeAPIService:
        return service

    app.dependency_overrides[require_current_user] = get_user
    app.dependency_overrides[get_practice_api_service] = get_service


def test_start_forwards_accept_language_returns_202_and_camel_case(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = selection().model_dump(mode="json")

    result = request(
        app,
        "POST",
        "/api/practice/sessions",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
    )

    assert result.status_code == 202
    assert result.json()["status"] == "generatingQuestion"
    assert result.json()["sessionId"] == str(SESSION_ID)
    assert service.calls[0][0] == "start"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["interaction_language"] == "en"


def test_start_body_cannot_supply_language_and_mutations_require_csrf(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {**selection().model_dump(mode="json"), "language": "en"}

    invalid = request(
        app,
        "POST",
        "/api/practice/sessions",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )
    csrf = request(
        app,
        "POST",
        "/api/practice/sessions",
        json=selection().model_dump(mode="json"),
    )

    assert invalid.status_code == 422
    assert csrf.status_code == 403
    assert service.calls == []


def test_refresh_uses_session_id_and_version_and_get_is_safe(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())

    refreshed = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/question-generation/refresh",
        json={"version": 1},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    fetched = request(app, "GET", f"/api/practice/sessions/{SESSION_ID}")

    assert refreshed.status_code == 200
    assert fetched.status_code == 200
    assert [call[0] for call in service.calls] == ["refresh", "get"]
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert service.calls[0][1]["payload"].version == 1


def test_complete_returns_completed_summary_and_forwards_only_version(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/complete",
        json={"version": 5},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "completed"
    assert result.json()["version"] == 6
    assert service.calls[0][0] == "complete"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(service.calls[0][1]["payload"], CompletePracticeSessionRequest)
    assert service.calls[0][1]["payload"].model_dump(mode="json") == {
        "version": 5
    }


def test_end_returns_completed_summary_and_forwards_only_public_early_body(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = {"version": 5, "questionId": str(uuid4())}

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/end",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "completed"
    assert service.calls[0][0] == "end"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(service.calls[0][1]["payload"], EndPracticeSessionEarlyRequest)
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


def test_completed_get_uses_public_session_union(app) -> None:
    service = FakePracticeAPIService()
    service.completed_get_result = service.completed_result
    install_service(app, service, user())

    result = request(app, "GET", f"/api/practice/sessions/{SESSION_ID}")

    assert result.status_code == 200
    assert result.json()["status"] == "completed"
    assert result.json()["completionReason"] == "reviewCompleted"


def test_continue_to_next_question_returns_202_and_forwards_only_public_body(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = {
        "version": 5,
        "questionId": str(uuid4()),
    }

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/next",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 202
    assert result.json()["status"] == "generatingQuestion"
    assert service.calls[0][0] == "continue"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(service.calls[0][1]["payload"], ContinuePracticeQuestionRequest)
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


def test_continue_to_next_question_requires_csrf_and_forbids_internal_fields(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {
        "version": 5,
        "questionId": str(uuid4()),
    }

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/next",
        json=payload,
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/next",
        json={**payload, "attemptId": str(uuid4())},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


def test_retry_current_question_returns_200_and_forwards_only_public_body(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = {
        "version": 5,
        "questionId": str(service.submit_result.question.id),
    }

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/retry",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "generatingFollowUp"
    assert service.calls[0][0] == "retry"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(service.calls[0][1]["payload"], RetryPracticeQuestionRequest)
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


def test_retry_current_question_requires_csrf_and_forbids_internal_fields(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {
        "version": 5,
        "questionId": str(service.submit_result.question.id),
    }

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/retry",
        json=payload,
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/retry",
        json={**payload, "retryOfAttemptId": str(uuid4())},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


@pytest.mark.parametrize(
    ("path", "method_name", "payload_type", "flag_name"),
    [
        (
            "saved",
            "set_saved",
            SetPracticeQuestionSavedRequest,
            "isSaved",
        ),
        (
            "weak",
            "set_weak",
            SetPracticeQuestionWeakRequest,
            "isMarkedWeak",
        ),
    ],
)
def test_question_flag_routes_return_200_and_forward_exact_body(
    app,
    path: str,
    method_name: str,
    payload_type,
    flag_name: str,
) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = {
        "version": 5,
        "questionId": str(service.submit_result.question.id),
        flag_name: True,
    }

    result = request(
        app,
        "PATCH",
        f"/api/practice/sessions/{SESSION_ID}/questions/{path}",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "generatingFollowUp"
    assert service.calls[0][0] == method_name
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(service.calls[0][1]["payload"], payload_type)
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


@pytest.mark.parametrize("path", ["saved", "weak"])
def test_question_flag_routes_require_csrf_and_reject_extra_fields(
    app,
    path: str,
) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {
        "version": 5,
        "questionId": str(service.submit_result.question.id),
        "isSaved" if path == "saved" else "isMarkedWeak": True,
    }

    csrf = request(
        app,
        "PATCH",
        f"/api/practice/sessions/{SESSION_ID}/questions/{path}",
        json=payload,
    )
    invalid = request(
        app,
        "PATCH",
        f"/api/practice/sessions/{SESSION_ID}/questions/{path}",
        json={**payload, "attemptId": str(uuid4())},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


@pytest.mark.parametrize(
    ("path", "method_name", "payload_type", "payload_fields"),
    [
        (
            "questions/hint",
            "reveal_hint",
            RevealPracticeQuestionGuidanceRequest,
            lambda question_id, follow_up_id: {
                "version": 2,
                "questionId": str(question_id),
            },
        ),
        (
            "questions/framework",
            "reveal_framework",
            RevealPracticeQuestionGuidanceRequest,
            lambda question_id, follow_up_id: {
                "version": 2,
                "questionId": str(question_id),
            },
        ),
        (
            "follow-ups/hint",
            "reveal_follow_up_hint",
            RevealPracticeFollowUpGuidanceRequest,
            lambda question_id, follow_up_id: {
                "version": 4,
                "questionId": str(question_id),
                "followUpQuestionId": str(follow_up_id),
            },
        ),
        (
            "follow-ups/framework",
            "reveal_follow_up_framework",
            RevealPracticeFollowUpGuidanceRequest,
            lambda question_id, follow_up_id: {
                "version": 4,
                "questionId": str(question_id),
                "followUpQuestionId": str(follow_up_id),
            },
        ),
    ],
)
def test_guidance_reveal_routes_return_200_and_forward_exact_body(
    app,
    path: str,
    method_name: str,
    payload_type,
    payload_fields,
) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    question_id = service.submit_result.question.id
    follow_up_id = uuid4()
    payload = payload_fields(question_id, follow_up_id)

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/{path}",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "generatingFollowUp"
    assert service.calls[0][0] == method_name
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(service.calls[0][1]["payload"], payload_type)
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload
    assert "content" not in payload
    assert "guidanceType" not in payload
    assert "attemptId" not in payload


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "questions/hint",
            {"version": 2, "questionId": str(uuid4())},
        ),
        (
            "follow-ups/framework",
            {
                "version": 4,
                "questionId": str(uuid4()),
                "followUpQuestionId": str(uuid4()),
            },
        ),
    ],
)
def test_guidance_reveal_routes_require_csrf_and_forbid_internal_fields(
    app,
    path: str,
    payload: dict[str, object],
) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/{path}",
        json=payload,
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/{path}",
        json={**payload, "content": ["forbidden"]},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    invalid_uuid = request(
        app,
        "POST",
        f"/api/practice/sessions/not-a-uuid/{path}",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )
    invalid_version = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/{path}",
        json={**payload, "version": 0},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert invalid_uuid.status_code == 422
    assert invalid_version.status_code == 422
    assert service.calls == []


def test_guidance_reveal_routes_publish_200_active_response_models_in_openapi(app) -> None:
    paths = app.openapi()["paths"]
    for path in (
        "/api/practice/sessions/{sessionId}/questions/hint",
        "/api/practice/sessions/{sessionId}/questions/framework",
        "/api/practice/sessions/{sessionId}/follow-ups/hint",
        "/api/practice/sessions/{sessionId}/follow-ups/framework",
    ):
        response_schema = paths[path]["post"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        assert {
            item["$ref"].split("/")[-1]
            for item in response_schema["oneOf"]
        } == {
            "PracticeGeneratingQuestionResponse",
            "PracticeAnsweringResponse",
            "PracticeGeneratingFollowUpResponse",
            "PracticeAnsweringFollowUpResponse",
            "PracticeEvaluatingResponse",
            "PracticeReviewResponse",
        }


def test_submit_primary_answer_returns_202_and_forwards_exact_body(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    question_id = service.submit_result.question.id
    payload = {
        "version": 2,
        "questionId": str(question_id),
        "content": "My answer",
    }

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/main",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 202
    assert result.json()["status"] == "generatingFollowUp"
    assert result.json()["version"] == 3
    assert result.json()["mainAnswer"]["content"] == "My answer"
    assert service.calls[0][0] == "submit"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


def test_submit_primary_answer_requires_csrf_and_forbids_extra_body_fields(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {
        "version": 2,
        "questionId": str(service.submit_result.question.id),
        "content": "My answer",
    }

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/main",
        json=payload,
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/main",
        json={**payload, "runId": str(uuid4())},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


def test_submit_follow_up_answer_returns_202_and_forwards_exact_body(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = {
        "version": 4,
        "questionId": str(service.submit_result.question.id),
        "followUpQuestionId": str(uuid4()),
        "content": "My follow-up answer",
    }

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/follow-up",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 202
    assert result.json()["status"] == "generatingFollowUp"
    assert service.calls[0][0] == "submit_follow_up"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


def test_submit_follow_up_answer_requires_csrf_and_forbids_extra_fields(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {
        "version": 4,
        "questionId": str(service.submit_result.question.id),
        "followUpQuestionId": str(uuid4()),
        "content": "My follow-up answer",
    }

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/follow-up",
        json=payload,
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/follow-up",
        json={**payload, "order": 2},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


def test_end_follow_ups_returns_202_and_forwards_exact_public_body(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = {
        "version": 4,
        "questionId": str(service.submit_result.question.id),
        "followUpQuestionId": str(
            service.end_follow_up_result.follow_up_completion.unanswered_question.id
        ),
    }

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/follow-ups/end",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 202
    assert result.json()["status"] == "evaluating"
    assert result.json()["followUpCompletion"]["status"] == "endedEarly"
    assert service.calls[0][0] == "end_follow_ups"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(
        service.calls[0][1]["payload"], EndPracticeFollowUpsRequest
    )
    assert service.calls[0][1]["payload"].model_dump(mode="json") == payload


def test_end_follow_ups_requires_csrf_and_forbids_internal_fields(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {
        "version": 4,
        "questionId": str(service.submit_result.question.id),
        "followUpQuestionId": str(
            service.end_follow_up_result.follow_up_completion.unanswered_question.id
        ),
    }

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/follow-ups/end",
        json=payload,
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/follow-ups/end",
        json={**payload, "unansweredQuestion": {}},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


def test_refresh_follow_up_generation_returns_200_and_forwards_version(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/follow-up-generation/refresh",
        json={"version": 3},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "generatingFollowUp"
    assert service.calls[0][0] == "refresh_follow_up"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert service.calls[0][1]["payload"].model_dump(mode="json") == {
        "version": 3
    }


def test_refresh_evaluation_returns_200_and_forwards_version(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)

    result = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/evaluation/refresh",
        json={"version": 4},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 200
    assert result.json()["status"] == "generatingQuestion"
    assert service.calls[0][0] == "refresh_evaluation"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert isinstance(
        service.calls[0][1]["payload"], RefreshPracticeEvaluationRequest
    )
    assert service.calls[0][1]["payload"].model_dump(mode="json") == {
        "version": 4
    }


def test_refresh_evaluation_requires_csrf_and_forbids_extra_fields(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())

    csrf = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/evaluation/refresh",
        json={"version": 4},
    )
    invalid = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/evaluation/refresh",
        json={"version": 4, "runId": str(uuid4())},
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert csrf.status_code == 403
    assert invalid.status_code == 422
    assert service.calls == []


def test_new_practice_mutations_require_authentication(app) -> None:
    service = FakePracticeAPIService()

    async def get_service() -> FakePracticeAPIService:
        return service

    app.dependency_overrides[get_practice_api_service] = get_service

    async def get_auth() -> object:
        return object()

    app.dependency_overrides[get_auth_service] = get_auth
    payload = {
        "version": 2,
        "questionId": str(service.submit_result.question.id),
        "content": "My answer",
    }

    submit = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/main",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )
    refresh = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/follow-up-generation/refresh",
        json={"version": 3},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    evaluation_refresh = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/evaluation/refresh",
        json={"version": 4},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    follow_up_submit = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/answers/follow-up",
        json={
            "version": 4,
            "questionId": str(service.submit_result.question.id),
            "followUpQuestionId": str(uuid4()),
            "content": "My follow-up answer",
        },
        headers={"Origin": TRUSTED_ORIGIN},
    )
    end_follow_ups = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/follow-ups/end",
        json={
            "version": 4,
            "questionId": str(service.submit_result.question.id),
            "followUpQuestionId": str(uuid4()),
        },
        headers={"Origin": TRUSTED_ORIGIN},
    )
    next_question = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/next",
        json={"version": 5, "questionId": str(uuid4())},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    retry_question = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/questions/retry",
        json={
            "version": 5,
            "questionId": str(service.submit_result.question.id),
        },
        headers={"Origin": TRUSTED_ORIGIN},
    )
    saved_question = request(
        app,
        "PATCH",
        f"/api/practice/sessions/{SESSION_ID}/questions/saved",
        json={
            "version": 5,
            "questionId": str(service.submit_result.question.id),
            "isSaved": True,
        },
        headers={"Origin": TRUSTED_ORIGIN},
    )
    weak_question = request(
        app,
        "PATCH",
        f"/api/practice/sessions/{SESSION_ID}/questions/weak",
        json={
            "version": 5,
            "questionId": str(service.submit_result.question.id),
            "isMarkedWeak": True,
        },
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert submit.status_code == 401
    assert refresh.status_code == 401
    assert evaluation_refresh.status_code == 401
    assert follow_up_submit.status_code == 401
    assert end_follow_ups.status_code == 401
    assert next_question.status_code == 401
    assert retry_question.status_code == 401
    assert saved_question.status_code == 401
    assert weak_question.status_code == 401
    assert service.calls == []


def test_practice_routes_require_authentication(app) -> None:
    service = FakePracticeAPIService()

    async def get_service() -> FakePracticeAPIService:
        return service

    app.dependency_overrides[get_practice_api_service] = get_service

    async def get_auth() -> object:
        return object()

    app.dependency_overrides[get_auth_service] = get_auth

    result = request(app, "GET", f"/api/practice/sessions/{SESSION_ID}")
    current = request(app, "GET", "/api/practice/sessions/current")

    assert result.status_code == 401
    assert result.json() == {"error": "not_authenticated"}
    assert current.status_code == 401
    assert current.json() == {"error": "not_authenticated"}
    assert service.calls == []


def test_current_session_is_static_safe_and_returns_camel_case(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)

    result = request(app, "GET", "/api/practice/sessions/current")

    assert result.status_code == 200
    assert result.json()["session"]["sessionId"] == str(SESSION_ID)
    assert service.calls == [("current", {"user_id": current_user.id})]


def test_current_session_returns_null_without_an_active_session(app) -> None:
    service = FakePracticeAPIService()
    service.current_result = CurrentPracticeSessionResponse(session=None)
    current_user = user()
    install_service(app, service, current_user)

    result = request(app, "GET", "/api/practice/sessions/current")

    assert result.status_code == 200
    assert result.json() == {"session": None}
    assert service.calls == [("current", {"user_id": current_user.id})]


def test_openapi_exposes_practice_union_contract(app) -> None:
    paths = app.openapi()["paths"]

    assert "/api/practice/sessions" in paths
    assert "/api/practice/sessions/{sessionId}" in paths
    assert "/api/practice/sessions/current" in paths
    assert (
        "/api/practice/sessions/{sessionId}/question-generation/refresh"
        in paths
    )
    assert "/api/practice/sessions/{sessionId}/answers/main" in paths
    assert "/api/practice/sessions/{sessionId}/answers/follow-up" in paths
    assert "/api/practice/sessions/{sessionId}/follow-ups/end" in paths
    assert (
        "/api/practice/sessions/{sessionId}/follow-up-generation/refresh"
        in paths
    )
    assert "/api/practice/sessions/{sessionId}/evaluation/refresh" in paths
    assert "/api/practice/sessions/{sessionId}/end" in paths
    assert "202" in paths["/api/practice/sessions"]["post"]["responses"]
    assert "200" in paths["/api/practice/sessions/{sessionId}"]["get"]["responses"]
    response_schema = paths["/api/practice/sessions"]["post"]["responses"]["202"][
        "content"
    ]["application/json"]["schema"]
    assert response_schema["discriminator"]["propertyName"] == "status"
    submit_schema = paths[
        "/api/practice/sessions/{sessionId}/answers/main"
    ]["post"]["responses"]["202"]["content"]["application/json"]["schema"]
    assert submit_schema["discriminator"]["propertyName"] == "status"
    follow_up_submit_schema = paths[
        "/api/practice/sessions/{sessionId}/answers/follow-up"
    ]["post"]["responses"]["202"]["content"]["application/json"]["schema"]
    assert follow_up_submit_schema["discriminator"]["propertyName"] == "status"
    end_follow_ups_schema = paths[
        "/api/practice/sessions/{sessionId}/follow-ups/end"
    ]["post"]["responses"]["202"]["content"]["application/json"]["schema"]
    assert end_follow_ups_schema["discriminator"]["propertyName"] == "status"
    current_schema = paths["/api/practice/sessions/current"]["get"]["responses"][
        "200"
    ]["content"]["application/json"]["schema"]
    assert current_schema["$ref"] == (
        "#/components/schemas/CurrentPracticeSessionResponse"
    )
