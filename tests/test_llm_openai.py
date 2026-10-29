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


def test_rate_limit_is_retried_once_then_reported(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda request: httpx.Response(429, text="rate limited"))
    with pytest.raises(llm.LlmUnavailable):
        llm.ask("system", "prompt", PurposeAssessment)
    assert len(seen) == 2
