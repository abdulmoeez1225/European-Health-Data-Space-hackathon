"""Staff oversight: flagged cases need attention; grants can be withdrawn, refusals reopened."""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend import audit, pipeline, spe
from backend.api import app
from backend.models import ReviewFlag
from tests.reference_plans import REFERENCE_PLANS

REQUESTS_DIR = Path(__file__).resolve().parent.parent / "requests"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "state_dir", lambda: tmp_path)
    monkeypatch.setenv("GATEKEEPER_LLM", "rules")
    monkeypatch.setattr("backend.llm.CACHE_DIR", tmp_path / "llm-cache")
    audit._loaded_from = None
    pipeline._results_loaded_from = None
    yield
    audit._loaded_from = None
    pipeline._results_loaded_from = None


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _submit(client: TestClient, request_id: str) -> dict[str, Any]:
    request = json.loads((REQUESTS_DIR / f"{request_id}.json").read_text(encoding="utf-8"))
    return client.post("/api/requests", json=request).json()


def test_decisions_are_issued_and_flagged_ones_need_attention(client: TestClient) -> None:
    body = _submit(client, "R04")
    assert body["status"] == "issued" and body["staff_action"] is None
    assert body["needs_attention"] is bool(body["review_flags"])


def test_needs_attention_only_while_issued() -> None:
    result = pipeline.process_request(json.loads((REQUESTS_DIR / "R04.json").read_text(encoding="utf-8")))
    flagged = result.model_copy(update={"review_flags": [ReviewFlag(reason="readings disagree")]})
    assert flagged.needs_attention is True
    assert flagged.model_copy(update={"status": "withdrawn"}).needs_attention is False


def test_withdrawal_pulls_the_secure_workspace(client: TestClient) -> None:
    _submit(client, "R05")
    output = spe.create_spe("permit-R05", REFERENCE_PLANS["R05"])
    with pipeline._results_lock:
        granted = pipeline._results["R05"].model_copy(update={"decision": "APPROVE_SPE", "spe": output})
        pipeline._results["R05"] = granted

    body = client.post("/api/requests/R05/withdraw", json={"reason": "Justification needs a closer look."}).json()

    assert body["status"] == "withdrawn" and body["needs_attention"] is False
    assert body["staff_action"]["kind"] == "withdrawn"
    assert body["staff_action"]["released_data_withdrawn"] is True
    assert body["spe"] is None and body["statistics"] is None
    assert client.get("/api/spe/permit-R05").status_code == 404
    assert any(e.event == "decision_withdrawn" and e.subject == "R05" for e in audit.events())


def test_refusal_is_reopened_not_withdrawn(client: TestClient) -> None:
    _submit(client, "R04")

    assert client.post("/api/requests/R04/withdraw", json={"reason": "x"}).status_code == 409
    body = client.post("/api/requests/R04/reopen", json={"reason": "Could be public health research."}).json()

    assert body["status"] == "reopened" and body["staff_action"]["kind"] == "reopened"
    assert body["staff_action"]["released_data_withdrawn"] is False
    assert any(e.event == "decision_reopened" and e.subject == "R04" for e in audit.events())


def test_grant_cannot_be_reopened_and_actions_happen_once(client: TestClient) -> None:
    _submit(client, "R05")
    output = spe.create_spe("permit-R05", REFERENCE_PLANS["R05"])
    with pipeline._results_lock:
        granted = pipeline._results["R05"].model_copy(update={"decision": "APPROVE_SPE", "spe": output})
        pipeline._results["R05"] = granted

    assert client.post("/api/requests/R05/reopen", json={"reason": "x"}).status_code == 409
    assert client.post("/api/requests/R05/withdraw", json={"reason": "x"}).status_code == 200
    assert client.post("/api/requests/R05/withdraw", json={"reason": "again"}).status_code == 409


def test_staff_action_survives_a_restart(client: TestClient) -> None:
    _submit(client, "R04")
    client.post("/api/requests/R04/reopen", json={"reason": "Applicant clarified the purpose."})
    pipeline._results_loaded_from = None
    assert client.get("/api/requests/R04").json()["status"] == "reopened"


@pytest.mark.parametrize("payload", [{}, {"reason": ""}, {"reason": "   "}])
def test_staff_actions_need_a_reason(client: TestClient, payload: dict[str, str]) -> None:
    _submit(client, "R04")
    assert client.post("/api/requests/R04/reopen", json=payload).status_code == 422


def test_actions_on_unknown_requests_are_not_found(client: TestClient) -> None:
    assert client.post("/api/requests/NOPE/withdraw", json={"reason": "x"}).status_code == 404
    assert client.post("/api/requests/NOPE/reopen", json={"reason": "x"}).status_code == 404
