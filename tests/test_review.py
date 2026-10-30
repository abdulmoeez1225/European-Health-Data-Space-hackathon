"""Staff oversight: flagged cases need attention; record access waits for a signed permit; grants can be
withdrawn, refusals appealed and reopened."""

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
    request = json.loads((REQUESTS_DIR / f"{request_id}.json").read_text())
    return client.post("/api/requests", json=request).json()


def _awaiting_permit(client: TestClient) -> dict[str, Any]:
    """R05 approved for records with its workspace prepared (the rules backend writes no query plan)."""
    body = _submit(client, "R05")
    assert body["decision"] == "APPROVE_SPE" and body["status"] == "awaiting_permit"
    output = spe.create_spe("permit-R05", REFERENCE_PLANS["R05"])
    with pipeline._results_lock:
        pipeline._store(pipeline._results["R05"].model_copy(update={"spe": output}))
    return client.get("/api/requests/R05").json()


def _issued_permit(client: TestClient) -> dict[str, Any]:
    _awaiting_permit(client)
    return client.post("/api/requests/R05/issue-permit", json={"reason": "Ethics approval checked."}).json()


def test_decisions_are_issued_and_flagged_ones_need_attention(client: TestClient) -> None:
    body = _submit(client, "R04")
    assert body["status"] == "issued" and body["staff_action"] is None
    assert body["needs_attention"] is bool(body["review_flags"])


def test_needs_attention_only_while_issued() -> None:
    result = pipeline.process_request(json.loads((REQUESTS_DIR / "R04.json").read_text()))
    flagged = result.model_copy(update={"review_flags": [ReviewFlag(reason="readings disagree")]})
    assert flagged.needs_attention is True
    assert flagged.model_copy(update={"status": "withdrawn"}).needs_attention is False


def test_record_access_waits_for_the_permit_and_the_workspace_stays_locked(client: TestClient) -> None:
    body = _awaiting_permit(client)
    assert body["needs_attention"] is True and body["staff_action"] is None
    assert body["spe"]["cohort_size"] > 0

    sql = {"sql": "SELECT count(*) FROM cohort"}
    for response in [
        client.get("/api/spe/permit-R05"),
        client.post("/api/spe/permit-R05/query", json=sql),
        client.get("/api/spe/permit-R05/download"),
        client.post("/api/spe/permit-R05/airlock", json={"table": "cohort", "group_by": ["region"]}),
    ]:
        assert response.status_code == 403
        assert response.json()["detail"] == "The data permit has not been issued yet"


def test_issuing_the_permit_opens_the_workspace(client: TestClient) -> None:
    body = _issued_permit(client)

    assert body["status"] == "issued" and body["needs_attention"] is bool(body["review_flags"])
    assert body["staff_action"]["kind"] == "permit_issued"
    assert body["staff_action"]["reason"] == "Ethics approval checked."
    assert body["staff_action"]["released_data_withdrawn"] is False
    assert body["spe"]["permit_id"] == "permit-R05"
    assert client.get("/api/spe/permit-R05").status_code == 200
    assert client.post("/api/requests/R05/issue-permit", json={"reason": "again"}).status_code == 409
    assert any(e.event == "permit_issued" and e.subject == "R05" for e in audit.events())


def test_statistics_need_no_permit(client: TestClient) -> None:
    body = _submit(client, "R01")
    assert body["decision"] == "APPROVE_STATISTICAL" and body["status"] == "issued"
    assert client.post("/api/requests/R01/issue-permit", json={"reason": "x"}).status_code == 409


def test_withdrawal_before_the_permit_deletes_the_prepared_workspace(client: TestClient) -> None:
    _awaiting_permit(client)

    body = client.post("/api/requests/R05/withdraw", json={"reason": "Applicant lacks ethics approval."}).json()

    assert body["status"] == "withdrawn" and body["needs_attention"] is False
    assert body["staff_action"]["released_data_withdrawn"] is False
    assert body["spe"] is None
    assert client.get("/api/spe/permit-R05").status_code == 404
    assert client.post("/api/requests/R05/issue-permit", json={"reason": "x"}).status_code == 409


def test_withdrawal_pulls_the_secure_workspace(client: TestClient) -> None:
    _issued_permit(client)

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
    _issued_permit(client)

    assert client.post("/api/requests/R05/reopen", json={"reason": "x"}).status_code == 409
    assert client.post("/api/requests/R05/withdraw", json={"reason": "x"}).status_code == 200
    assert client.post("/api/requests/R05/withdraw", json={"reason": "again"}).status_code == 409


def test_applicant_appeals_a_refusal_once_and_staff_reopen_it(client: TestClient) -> None:
    _submit(client, "R04")

    body = client.post("/api/requests/R04/appeal", json={"reason": "The campaign is a public health one."}).json()

    assert body["status"] == "issued" and body["needs_attention"] is True
    assert body["appeal"]["reason"] == "The campaign is a public health one." and body["appeal"]["at"]
    assert client.post("/api/requests/R04/appeal", json={"reason": "again"}).status_code == 409
    assert any(e.event == "appeal_lodged" and e.subject == "R04" for e in audit.events())

    reopened = client.post("/api/requests/R04/reopen", json={"reason": "Appeal is plausible."}).json()
    assert reopened["status"] == "reopened" and reopened["needs_attention"] is False
    assert reopened["appeal"] == body["appeal"]


@pytest.mark.parametrize("request_id", ["R01", "R05"])
def test_only_refusals_can_be_appealed(client: TestClient, request_id: str) -> None:
    _submit(client, request_id)
    assert client.post(f"/api/requests/{request_id}/appeal", json={"reason": "x"}).status_code == 409


def test_a_reopened_refusal_cannot_be_appealed(client: TestClient) -> None:
    _submit(client, "R04")
    client.post("/api/requests/R04/reopen", json={"reason": "Staff look again."})
    assert client.post("/api/requests/R04/appeal", json={"reason": "x"}).status_code == 409


def _post(client: TestClient, request_id: str):
    return client.post("/api/requests", json=json.loads((REQUESTS_DIR / f"{request_id}.json").read_text()))


def test_resubmitting_cannot_undo_a_staff_action(client: TestClient) -> None:
    _issued_permit(client)
    client.post("/api/requests/R05/withdraw", json={"reason": "Permit revoked."})

    response = _post(client, "R05")

    assert response.status_code == 409
    assert response.json()["detail"] == "This request already has a decision; submit it under a new id."
    body = client.get("/api/requests/R05").json()
    assert body["status"] == "withdrawn" and body["spe"] is None


def test_resubmitting_is_blocked_while_awaiting_permit_or_appealed(client: TestClient) -> None:
    _awaiting_permit(client)
    _submit(client, "R04")
    client.post("/api/requests/R04/appeal", json={"reason": "Please look again."})

    assert _post(client, "R05").status_code == 409
    assert _post(client, "R04").status_code == 409
    assert client.get("/api/requests/R05").json()["status"] == "awaiting_permit"


def test_an_untouched_decision_can_be_resubmitted(client: TestClient) -> None:
    _submit(client, "R01")
    assert _post(client, "R01").status_code == 200


def test_staff_action_survives_a_restart(client: TestClient) -> None:
    _submit(client, "R04")
    client.post("/api/requests/R04/reopen", json={"reason": "Applicant clarified the purpose."})
    pipeline._results_loaded_from = None
    assert client.get("/api/requests/R04").json()["status"] == "reopened"


@pytest.mark.parametrize("action", ["reopen", "appeal"])
@pytest.mark.parametrize("payload", [{}, {"reason": ""}, {"reason": "   "}, {"reason": "x" * 2001}])
def test_actions_need_a_reason(client: TestClient, action: str, payload: dict[str, str]) -> None:
    _submit(client, "R04")
    assert client.post(f"/api/requests/R04/{action}", json=payload).status_code == 422


def test_actions_on_unknown_requests_are_not_found(client: TestClient) -> None:
    assert client.post("/api/requests/NOPE/withdraw", json={"reason": "x"}).status_code == 404
    assert client.post("/api/requests/NOPE/reopen", json={"reason": "x"}).status_code == 404
    assert client.post("/api/requests/NOPE/issue-permit", json={"reason": "x"}).status_code == 404
    assert client.post("/api/requests/NOPE/appeal", json={"reason": "x"}).status_code == 404
