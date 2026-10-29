"""HTTP API and static web UI. Run: .venv/bin/uvicorn app.api:app --port 8000"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from app import audit, ledger, spe
from app.config import ROOT, settings
from app.db import connection
from app.law import ARTICLES, EUR_LEX_URL, Article
from app.llm import backend_name
from app.models import RequestResult
from app.pipeline import get_result, process_request, results

access_log = logging.getLogger("gatekeeper.access")


def _configure_logging() -> None:
    """One plain-message line per record on stderr; the access log writes JSON itself."""
    logger = logging.getLogger("gatekeeper")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.propagate = False
    logger.setLevel(settings().log_level.upper())


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _configure_logging()
    connection()
    yield


class ErrorBody(BaseModel):
    detail: str


class DownloadBlocked(BaseModel):
    detail: str
    audit_id: str


class PatientCounts(BaseModel):
    total: int
    eligible: int
    opted_out: int


class Health(BaseModel):
    status: Literal["ok"]
    llm_backend: str
    patients: PatientCounts


class LawResponse(BaseModel):
    source: str
    articles: list[Article]


class SqlBody(BaseModel):
    sql: str


class LedgerResetResult(BaseModel):
    status: Literal["ok"] = "ok"


app = FastAPI(title="Gatekeeper – Health Data Access Body", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    started = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        access_log.info(json.dumps({
            "method": request.method,
            "path": request.url.path,
            "status": status,
            "duration_ms": round((time.perf_counter() - started) * 1000, 1),
        }))


def _load_requests(folder: Path) -> list[dict[str, Any]]:
    return [json.loads(p.read_text()) for p in sorted(folder.glob("*.json")) if p.name != "expected.json"]


@app.get("/api/health", response_model=Health)
def health() -> Health:
    con = connection()
    counts = con.execute(
        "SELECT (SELECT count(*) FROM raw_patients), (SELECT count(*) FROM patients)"
    ).fetchone()
    assert counts is not None
    total, eligible = counts
    return Health(
        status="ok",
        llm_backend=backend_name(),
        patients=PatientCounts(total=total, eligible=eligible, opted_out=total - eligible),
    )


@app.get("/api/samples", response_model=list[dict[str, Any]])
def samples() -> list[dict[str, Any]]:
    return _load_requests(ROOT / "requests")


@app.post("/api/requests", response_model=RequestResult, responses={422: {"model": ErrorBody}})
def submit(request: dict[str, Any]) -> RequestResult:
    if not isinstance(request.get("applicant"), dict) or not request.get("purpose"):
        raise HTTPException(422, "A request needs an applicant object and a purpose.")
    return process_request(request)


@app.get("/api/requests", response_model=list[RequestResult])
def list_requests() -> list[RequestResult]:
    return results()


@app.get("/api/requests/{request_id}", response_model=RequestResult, responses={404: {"model": ErrorBody}})
def get_request(request_id: str) -> RequestResult:
    found = get_result(request_id)
    if found is None:
        raise HTTPException(404, f"No processed request {request_id}.")
    return found


@app.get("/api/law", response_model=LawResponse)
def law() -> LawResponse:
    return LawResponse(source=EUR_LEX_URL, articles=list(ARTICLES.values()))


@app.get("/api/spe/{permit_id}", response_model=spe.SpeInfo, responses={404: {"model": ErrorBody}})
def spe_info(permit_id: str) -> spe.SpeInfo:
    try:
        return spe.spe_info(permit_id)
    except spe.SpeNotFound as error:
        raise HTTPException(404, str(error)) from error


@app.post(
    "/api/spe/{permit_id}/query",
    response_model=spe.QueryResult,
    responses={400: {"model": ErrorBody}, 404: {"model": ErrorBody}},
)
def spe_query(permit_id: str, body: SqlBody) -> spe.QueryResult:
    try:
        return spe.run_query(permit_id, body.sql)
    except spe.SpeNotFound as error:
        raise HTTPException(404, str(error)) from error
    except spe.SpeBlocked as error:
        raise HTTPException(400, f"Blocked: {error.reason}") from error
    except spe.SpeQueryError as error:
        raise HTTPException(400, str(error)) from error


@app.get(
    "/api/spe/{permit_id}/download",
    status_code=403,
    response_model=DownloadBlocked,
    responses={403: {"model": DownloadBlocked}, 404: {"model": ErrorBody}},
)
def spe_download(permit_id: str) -> DownloadBlocked:
    try:
        spe.spe_info(permit_id)
    except spe.SpeNotFound as error:
        raise HTTPException(404, str(error)) from error
    event = spe.block_download(permit_id, actor="researcher")
    return DownloadBlocked(
        detail="Download blocked: data cannot leave the secure processing environment (Art. 73). "
               "Only anonymised results may be exported through the airlock.",
        audit_id=event.id,
    )


@app.post("/api/spe/{permit_id}/airlock", response_model=spe.AirlockResult, responses={404: {"model": ErrorBody}})
def spe_airlock(permit_id: str, body: SqlBody) -> spe.AirlockResult:
    try:
        return spe.airlock_export(permit_id, body.sql)
    except spe.SpeNotFound as error:
        raise HTTPException(404, str(error)) from error


@app.get("/api/audit", response_model=list[audit.AuditEvent])
def audit_log(limit: int = 200) -> list[audit.AuditEvent]:
    return audit.events(limit)


@app.get("/api/ledger", response_model=list[ledger.LedgerEvent])
def ledger_log() -> list[ledger.LedgerEvent]:
    return ledger.ledger_events()


@app.post("/api/ledger/reset", response_model=LedgerResetResult)
def ledger_reset() -> LedgerResetResult:
    ledger.reset_ledger()
    audit.record("ledger_reset", "staff", "ledger")
    return LedgerResetResult()


class ExportedSiteFiles(StaticFiles):
    """Static export of the frontend: folder routes resolve through html=True; unknown paths get its 404 page."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code != 404 or path.startswith("api/"):
                raise
            root = Path(str(self.directory))
            if (root / "404.html").exists():
                return FileResponse(root / "404.html", status_code=404)
            return FileResponse(root / "index.html")


FRONTEND_OUT = ROOT / "frontend" / "out"
if (FRONTEND_OUT / "index.html").exists():
    app.mount("/", ExportedSiteFiles(directory=FRONTEND_OUT, html=True), name="frontend")
else:

    @app.get("/", include_in_schema=False)
    def frontend_missing() -> JSONResponse:
        return JSONResponse({"detail": "Frontend not built. Run `make frontend`, then reload. The API is at /api."})
