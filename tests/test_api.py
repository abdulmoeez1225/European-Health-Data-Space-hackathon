import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend import audit, spe
from backend.api import app
from backend.db import connection
from tests.reference_plans import REFERENCE_PLANS

PERMIT = "permit-api"
REQUESTS_DIR = Path(__file__).resolve().parent.parent / "requests"


@pytest.fixture(autouse=True)
def state_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "state_dir", lambda: tmp_path)
    audit._loaded_from = None
    yield
    audit._loaded_from = None


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def permit() -> str:
    spe.create_spe(PERMIT, REFERENCE_PLANS["R05"])
    return PERMIT


def test_health_reports_loaded_patients(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("GATEKEEPER_LLM", "rules")
    body = client.get("/api/health").json()
    total = connection().execute("SELECT count(*) FROM raw_patients").fetchone()[0]
    eligible = connection().execute("SELECT count(*) FROM patients").fetchone()[0]
    assert body["status"] == "ok"
    assert body["llm_backend"] == "rules"
    assert body["patients"] == {"total": total, "eligible": eligible, "opted_out": total - eligible}
    assert 0 < body["patients"]["opted_out"] < total


def test_samples_are_the_ten_track_requests(client: TestClient) -> None:
    body = client.get("/api/samples").json()
    ids = [sample["id"] for sample in body]
    assert ids == [f"R{n:02d}" for n in range(1, 11)]
    assert all(isinstance(sample["applicant"], dict) and sample["purpose"] for sample in body)


def test_law_lists_articles_with_source(client: TestClient) -> None:
    body = client.get("/api/law").json()
    assert body["source"].startswith("https://eur-lex.europa.eu/")
    numbers = {article["number"] for article in body["articles"]}
    assert {"53", "54", "66", "69", "73"} <= numbers
    assert set(body["articles"][0]) == {"number", "title", "summary"}


def test_spe_info_unknown_permit_is_404(client: TestClient) -> None:
    response = client.get("/api/spe/permit-missing")
    assert response.status_code == 404
    assert "detail" in response.json()


def test_spe_info_known_permit(client: TestClient, permit: str) -> None:
    body = client.get(f"/api/spe/{permit}").json()
    assert body["permit_id"] == permit
    assert {t["name"] for t in body["tables"]} == {"cohort", "conditions", "medications", "observations"}


def test_download_is_blocked_with_403_and_audited(client: TestClient, permit: str) -> None:
    response = client.get(f"/api/spe/{permit}/download")
    assert response.status_code == 403
    body = response.json()
    assert set(body) == {"detail", "audit_id"}
    assert "Art. 73" in body["detail"]
    assert any(e.id == body["audit_id"] and e.event == "download_blocked" for e in audit.events())


def test_download_of_unknown_permit_is_404(client: TestClient) -> None:
    assert client.get("/api/spe/permit-missing/download").status_code == 404


def test_spe_query_blocks_writes_with_400(client: TestClient, permit: str) -> None:
    response = client.post(f"/api/spe/{permit}/query", json={"sql": "DROP TABLE cohort"})
    assert response.status_code == 400
    assert response.json()["detail"].startswith("Blocked")


def test_ledger_reset_clears_ledger_and_is_audited(client: TestClient) -> None:
    response = client.post("/api/ledger/reset")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert client.get("/api/ledger").json() == []
    assert [e["event"] for e in client.get("/api/audit").json()] == ["ledger_reset"]


def test_unknown_request_id_is_404(client: TestClient) -> None:
    assert client.get("/api/requests/does-not-exist").status_code == 404


def test_submit_without_purpose_is_422(client: TestClient) -> None:
    assert client.post("/api/requests", json={"applicant": {"name": "A"}}).status_code == 422


def test_submit_with_rules_backend_needs_no_llm(client: TestClient, monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GATEKEEPER_LLM", "rules")
    monkeypatch.setattr("backend.llm.CACHE_DIR", tmp_path / "llm-cache")
    request: dict[str, Any] = json.loads((REQUESTS_DIR / "R01.json").read_text())
    response = client.post("/api/requests", json=request)
    assert response.status_code == 200
    body = response.json()
    assert body["decision"] in {"REJECT", "APPROVE_STATISTICAL", "APPROVE_SPE"}
    assert body["llm_backend"] == "rules"
    assert client.get(f"/api/requests/{body['request_id']}").status_code == 200


def test_openapi_declares_typed_responses(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    for path, methods in schema["paths"].items():
        for method, operation in methods.items():
            typed = [
                r["content"]["application/json"]["schema"]
                for code, r in operation["responses"].items()
                if code != "422" and "content" in r
            ]
            assert typed and all(typed), (method, path)
    download = schema["paths"]["/api/spe/{permit_id}/download"]["get"]["responses"]["403"]
    assert download["content"]["application/json"]["schema"]["$ref"].endswith("/DownloadBlocked")


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://localhost:5173"])
def test_cors_allows_dev_servers(client: TestClient, origin: str) -> None:
    response = client.get("/api/law", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin


def test_root_serves_the_ui_and_unknown_api_path_is_404(client: TestClient) -> None:
    assert client.get("/").status_code == 200
    assert client.get("/api/does-not-exist").status_code == 404
