import json

import httpx
import pytest

from backend import llm
from backend.models import PurposeAssessment

ANSWER = {
    "prohibited": True,
    "prohibited_ground": "advertising_or_marketing",
    "allowed_purpose": "none",
    "records_justified": False,
    "justification": "physician advertising campaign",
    "explanation_for_applicant": "Advertising is prohibited.",
}


@pytest.fixture(autouse=True)
def openai_backend(monkeypatch, tmp_path):
    monkeypatch.setenv("GATEKEEPER_LLM", "openai")
    monkeypatch.setenv("GATEKEEPER_LLM_BASE_URL", "https://llm.example/v1")
    monkeypatch.setenv("GATEKEEPER_LLM_API_KEY", "test-key")
    monkeypatch.setenv("GATEKEEPER_LLM_MODEL", "free-model")
    monkeypatch.setattr(llm, "CACHE_DIR", tmp_path)


def _serve(monkeypatch, handler) -> list[dict]:
    seen: list[dict] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return handler(request)

    monkeypatch.setattr(llm, "_http_client", lambda: httpx.Client(transport=httpx.MockTransport(record)))
    return seen


def _completion(content: str, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": finish_reason}]})


def test_structured_output_with_strict_schema(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda request: _completion(json.dumps(ANSWER)))

    answer, cached = llm.ask("system", "prompt", PurposeAssessment)

    assert answer.prohibited_ground == "advertising_or_marketing" and cached is False
    assert seen[0]["model"] == "free-model" and seen[0]["temperature"] == 0
    assert seen[0]["response_format"]["type"] == "json_schema"


def test_falls_back_to_json_mode_when_schemas_are_unsupported(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["response_format"]["type"] == "json_schema":
            return httpx.Response(400, json={"error": "response_format json_schema not supported"})
        return _completion("```json\n" + json.dumps(ANSWER) + "\n```")

    seen = _serve(monkeypatch, handler)

    answer, _ = llm.ask("system", "prompt", PurposeAssessment)

    assert answer.prohibited is True
    assert [b["response_format"]["type"] for b in seen] == ["json_schema", "json_object"]
    assert "JSON Schema" in seen[1]["messages"][0]["content"]


def test_content_filter_is_a_refusal(monkeypatch) -> None:
    _serve(monkeypatch, lambda request: _completion("", finish_reason="content_filter"))
    with pytest.raises(llm.LlmRefused):
        llm.ask("system", "prompt", PurposeAssessment)


def test_server_error_is_retried_once_then_reported(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda request: httpx.Response(503, text="unavailable"))
    with pytest.raises(llm.LlmUnavailable):
        llm.ask("system", "prompt", PurposeAssessment)
    assert len(seen) == 2


def test_rate_limit_waits_as_asked_then_succeeds(monkeypatch) -> None:
    responses = iter([
        httpx.Response(429, json=[{"error": {"details": [{"retryDelay": "7s"}]}}]),
        _completion(json.dumps(ANSWER)),
    ])
    _serve(monkeypatch, lambda request: next(responses))
    slept: list[float] = []
    monkeypatch.setattr(llm.time, "sleep", slept.append)

    answer, _ = llm.ask("system", "prompt", PurposeAssessment)

    assert answer.prohibited is True
    assert slept == [7.0]


def test_rate_limit_gives_up_after_the_attempt_limit(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda request: httpx.Response(429, headers={"retry-after": "1"}))
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    with pytest.raises(llm.LlmRateLimited):
        llm.ask("system", "prompt", PurposeAssessment)
    assert len(seen) == llm.RATE_LIMIT_ATTEMPTS


def test_openrouter_requires_providers_that_honour_the_schema(monkeypatch) -> None:
    monkeypatch.setenv("GATEKEEPER_LLM_BASE_URL", "https://openrouter.ai/api/v1")
    headers: list[httpx.Headers] = []

    def handler(request: httpx.Request) -> httpx.Response:
        headers.append(request.headers)
        return _completion(json.dumps(ANSWER))

    seen = _serve(monkeypatch, handler)

    llm.ask("system", "prompt", PurposeAssessment)

    assert seen[0]["provider"] == {"require_parameters": True}
    assert headers[0]["X-Title"] == "Gatekeeper" and headers[0]["HTTP-Referer"] == llm.OPENROUTER_REFERER


def test_other_endpoints_get_no_openrouter_fields(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda request: _completion(json.dumps(ANSWER)))

    llm.ask("system", "prompt", PurposeAssessment)

    assert "provider" not in seen[0]


def test_openrouter_without_schema_providers_falls_back_to_json_mode(monkeypatch) -> None:
    monkeypatch.setenv("GATEKEEPER_LLM_BASE_URL", "https://openrouter.ai/api/v1")

    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["response_format"]["type"] == "json_schema":
            return httpx.Response(404, json={"error": {"code": 404, "message": "No endpoints found"}})
        return _completion(json.dumps(ANSWER))

    seen = _serve(monkeypatch, handler)

    answer, _ = llm.ask("system", "prompt", PurposeAssessment)

    assert answer.prohibited is True
    assert [b["response_format"]["type"] for b in seen] == ["json_schema", "json_object"]


def test_schema_rejected_inside_a_200_answer_falls_back_to_json_mode(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["response_format"]["type"] == "json_schema":
            return httpx.Response(200, json={"error": {"code": 400, "message": "oneOf constraints are not supported"}})
        return _completion(json.dumps(ANSWER))

    seen = _serve(monkeypatch, handler)

    answer, _ = llm.ask("system", "prompt", PurposeAssessment)

    assert answer.prohibited is True
    assert [b["response_format"]["type"] for b in seen] == ["json_schema", "json_object"]


def test_error_object_in_a_200_answer_is_reported(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda request: httpx.Response(
        200, json={"error": {"code": 502, "message": "upstream provider failed"}}))
    with pytest.raises(llm.LlmUnavailable, match="upstream provider failed"):
        llm.ask("system", "prompt", PurposeAssessment)
    assert len(seen) == 2


def test_rate_limit_inside_a_200_answer_waits_and_retries(monkeypatch) -> None:
    responses = iter([
        httpx.Response(200, json={"error": {"code": 429, "message": "rate limited upstream"}}),
        _completion(json.dumps(ANSWER)),
    ])
    _serve(monkeypatch, lambda request: next(responses))
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)

    answer, _ = llm.ask("system", "prompt", PurposeAssessment)

    assert answer.prohibited is True


def test_missing_credits_are_reported_clearly(monkeypatch) -> None:
    _serve(monkeypatch, lambda request: httpx.Response(402, json={"error": {"message": "Insufficient credits"}}))
    with pytest.raises(llm.LlmUnavailable, match="credits"):
        llm.ask("system", "prompt", PurposeAssessment)


def test_request_budget_spaces_calls_evenly(monkeypatch) -> None:
    clock = [100.0]
    slept: list[float] = []
    monkeypatch.setattr(llm.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(llm.time, "sleep", slept.append)
    budget = llm._RequestBudget()

    for _ in range(3):
        budget.wait(max_rpm=30)

    assert slept == [0.0, 2.0, 4.0]
