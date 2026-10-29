"""Release ledger against differencing attacks.

The small-cell rule judges each answer alone. An applicant who receives
"adults with type 2 diabetes in Burgenland" (33) and later the same group aged
40+ (32) can subtract the two and learn about one patient. The ledger remembers
the patient/encounter sets already released to each applicant and suppresses a
value whose set is a strict subset or superset of an earlier release that
differs by fewer than MIN_CELL units. ID sets stay in memory and are never
written to the audit log.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from app import audit
from app.stats import LESS_THAN, MIN_CELL, SUPPRESSED, Cell, StatResult

_lock = threading.Lock()


class LedgerEvent(BaseModel):
    time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    applicant_key: str
    request_id: str
    metric: str
    labels: dict[str, str]
    other_request_id: str
    revealed_count: int


@dataclass(frozen=True)
class _Release:
    units: frozenset[str]
    released_at: datetime


# applicant -> request -> sets released for that request
_released: dict[str, dict[str, list[_Release]]] = {}
_events: list[LedgerEvent] = []


def applicant_key(request: dict) -> str:
    applicant = request.get("applicant", request)
    name = applicant.get("organisation") or applicant.get("name") or ""
    return " ".join(name.lower().split())


def _is_released_number(cell: Cell) -> bool:
    return isinstance(cell.shown, (int, float)) and not isinstance(cell.shown, bool)


def _revealed(units: frozenset[str], earlier: frozenset[str]) -> int:
    """Units isolated by differencing two nested sets, or 0 if they are not a small nested pair."""
    if not (units < earlier or earlier < units):
        return 0
    difference = abs(len(units) - len(earlier))
    return difference if 1 <= difference < MIN_CELL else 0


def _worst_conflict(cell: Cell, others: dict[str, list[_Release]]) -> tuple[str, _Release, int] | None:
    """The earlier release that would reveal the fewest patients, as (request, release, count)."""
    conflicts = [
        (other_id, release, revealed)
        for other_id, releases in others.items()
        for release in releases
        for units in cell.unit_sets
        if (revealed := _revealed(units, release.units))
    ]
    return min(conflicts, key=lambda c: (c[2], c[1].released_at), default=None)


def _block(cell: Cell, other_id: str, release: _Release, revealed: int) -> None:
    cell.shown = LESS_THAN if cell.kind == "count" else SUPPRESSED
    noun = "patient" if revealed == 1 else "patients"
    cell.suppressed_by = (
        f"differencing: combined with {other_id} (released {release.released_at:%H:%M}) "
        f"this would reveal {revealed} {noun}"
    )


def apply_ledger(applicant_key: str, request_id: str, result: StatResult) -> list[LedgerEvent]:
    now = datetime.now(UTC)
    new_events: list[LedgerEvent] = []
    with _lock:
        history = _released.setdefault(applicant_key, {})
        others = {rid: releases for rid, releases in history.items() if rid != request_id}
        first_seen = {r.units: r.released_at for r in history.get(request_id, [])}
        released: list[_Release] = []
        for row in result.rows:
            for cell in row.cells:
                if not _is_released_number(cell):
                    continue
                conflict = _worst_conflict(cell, others)
                if conflict is None:
                    released += [_Release(units, first_seen.get(units, now)) for units in cell.unit_sets]
                    continue
                other_id, release, revealed = conflict
                _block(cell, other_id, release, revealed)
                new_events.append(LedgerEvent(
                    time=now, applicant_key=applicant_key, request_id=request_id, metric=cell.metric,
                    labels=dict(row.labels), other_request_id=other_id, revealed_count=revealed,
                ))
        history[request_id] = released
        _events[:] = [e for e in _events if (e.applicant_key, e.request_id) != (applicant_key, request_id)]
        _events.extend(new_events)

    for event in new_events:
        audit.record("ledger_blocked", "system", request_id, {
            "metric": event.metric, "labels": event.labels,
            "other_request_id": event.other_request_id, "revealed_count": event.revealed_count,
        })
    return new_events


def ledger_events() -> list[LedgerEvent]:
    with _lock:
        return list(_events)


def reset_ledger() -> None:
    with _lock:
        _released.clear()
        _events.clear()
