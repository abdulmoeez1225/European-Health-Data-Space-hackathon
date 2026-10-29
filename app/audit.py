"""Append-only audit log of every decision, release and blocked action.

Art. 66 requires the HDAB to account for what was permitted and what left the
secure environment. Events are written as JSON lines so the log survives
restarts; it never contains patient-level data.
"""

from __future__ import annotations

import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from app.config import settings

_lock = threading.Lock()
_events: list[AuditEvent] = []
_loaded_from: Path | None = None


class AuditEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    event: str
    actor: str
    subject: str
    detail: dict = Field(default_factory=dict)


def state_dir() -> Path:
    path = settings().state_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def _log_path() -> Path:
    return state_dir() / "audit.jsonl"


def _load() -> None:
    """Read the log file once per file location. Caller holds the lock."""
    global _loaded_from
    path = _log_path()
    if _loaded_from == path:
        return
    _events.clear()
    if path.exists():
        _events.extend(
            AuditEvent.model_validate_json(line) for line in path.read_text().splitlines() if line.strip()
        )
    _loaded_from = path


def record(event: str, actor: str, subject: str, detail: dict | None = None) -> AuditEvent:
    entry = AuditEvent(event=event, actor=actor, subject=subject, detail=detail or {})
    with _lock:
        _load()
        with _log_path().open("a", encoding="utf-8") as handle:
            handle.write(entry.model_dump_json() + "\n")
        _events.append(entry)
    return entry


def events(limit: int = 200) -> list[AuditEvent]:
    """Newest first."""
    with _lock:
        _load()
        return list(reversed(_events))[:limit]
