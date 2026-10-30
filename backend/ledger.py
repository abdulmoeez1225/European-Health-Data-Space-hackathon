"""Release ledger against differencing attacks.

The small-cell rule judges each value alone. Values can be combined: "adults
with type 2 diabetes in Burgenland" (33) and the same group aged 40+ (32)
differ by one patient, whoever asked for them. The ledger remembers the
patient/encounter set behind every value released to anyone and withholds a
new value when

- its set is nested in a set released by an earlier answer and the two differ
  by 1 to 9 units, or
- together with released sets, from earlier answers or this one, it isolates
  a small group the app withheld (a "<10" cell, or the difference behind an
  earlier block): an outer set minus disjoint released parts equals that group.

Nested values inside one answer that differ by 1 to 9 are released, as the
small-cell rule requires ("adults with an eGFR" 15, "eGFR below 45" 12).

Releasing a set that was already released reveals nothing new, so a repeated
request gets the same answer. The ID sets are kept in the app's state
directory so a restart does not forget earlier releases; they are never
written to the audit log.
"""

from __future__ import annotations

import json
import threading
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from backend import audit
from backend.stats import MIN_CELL, SUPPRESSED, Cell, StatResult

# Exact-cover steps per check; beyond it the value is withheld rather than released unchecked.
_COVER_BUDGET = 500

_lock = threading.Lock()

Units = frozenset[str]


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
    request_id: str
    released_at: datetime


@dataclass(frozen=True)
class _Conflict:
    other: _Release
    revealed: Units


_released: dict[Units, _Release] = {}
_by_size: defaultdict[int, list[Units]] = defaultdict(list)
_by_unit: defaultdict[str, list[Units]] = defaultdict(list)
_withheld: set[Units] = set()
_events: list[LedgerEvent] = []
_loaded_from: Path | None = None


def _store_path() -> Path:
    return audit.state_dir() / "ledger.json"


def _add_release(units: Units, release: _Release) -> None:
    _released[units] = release
    _by_size[len(units)].append(units)
    for unit in units:
        _by_unit[unit].append(units)


def _clear() -> None:
    _released.clear()
    _by_size.clear()
    _by_unit.clear()
    _withheld.clear()
    _events.clear()


def _stored_releases(stored: dict) -> list[dict]:
    released = stored["released"]
    if isinstance(released, list):
        return released
    # Earlier format: applicant -> request -> releases.
    return [
        {**release, "request_id": rid}
        for requests in released.values() for rid, releases in requests.items() for release in releases
    ]


def _ensure_loaded() -> None:
    """Load the persisted ledger once per state directory. Caller holds the lock."""
    global _loaded_from
    path = _store_path()
    if _loaded_from == path:
        return
    _clear()
    if path.exists():
        stored = json.loads(path.read_text())
        releases = sorted(_stored_releases(stored), key=lambda r: r["released_at"])
        for r in releases:
            units = frozenset(r["units"])
            if units not in _released:
                _add_release(units, _Release(r["request_id"], datetime.fromisoformat(r["released_at"])))
        _withheld.update(frozenset(units) for units in stored.get("withheld", []))
        _events.extend(LedgerEvent.model_validate(e) for e in stored["events"])
    _loaded_from = path


def _save() -> None:
    """Persist the ledger atomically. Caller holds the lock."""
    stored = {
        "released": [
            {"units": sorted(units), "request_id": r.request_id, "released_at": r.released_at.isoformat()}
            for units, r in _released.items()
        ],
        "withheld": [sorted(units) for units in _withheld],
        "events": [e.model_dump(mode="json") for e in _events],
    }
    path = _store_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(stored))
    tmp.replace(path)


def applicant_key(request: dict) -> str:
    applicant = request.get("applicant", request)
    name = applicant.get("organisation") or applicant.get("name") or ""
    return " ".join(name.lower().split())


def _is_released_number(cell: Cell) -> bool:
    return isinstance(cell.shown, (int, float)) and not isinstance(cell.shown, bool)


def _nested_conflicts(units: Units, this_answer: set[Units]) -> list[_Conflict]:
    """Sets released by earlier answers that are nested with `units` and differ from it by 1 to 9 units."""
    return [
        _Conflict(_released[other], units ^ other)
        for size in range(max(len(units) - MIN_CELL + 1, 1), len(units) + MIN_CELL) if size != len(units)
        for other in _by_size.get(size, [])
        if other not in this_answer and (other < units or units < other)
    ]


def _cover(target: Units, budget: list[int]) -> list[Units] | None:
    """Disjoint released sets that add up to exactly `target`, or None."""
    if not target:
        return []
    budget[0] -= 1
    if budget[0] < 0:
        return []
    for part in _by_unit.get(min(target), []):
        if len(part) <= len(target) and part <= target:
            rest = _cover(target - part, budget)
            if rest is not None:
                return [part, *rest]
    return None


def _recovery_conflicts(units: Units, now: datetime) -> list[_Conflict]:
    """Withheld small groups that releasing `units` would make computable by subtraction."""
    conflicts = []
    for hidden in _withheld:
        if hidden < units:
            parts = _cover(units - hidden, [_COVER_BUDGET])
        elif hidden.isdisjoint(units):
            outers = (o for o in _by_unit.get(min(hidden), []) if hidden <= o and units < o)
            parts = next(
                (
                    [outer, *rest] for outer in outers
                    if (rest := _cover(outer - hidden - units, [_COVER_BUDGET])) is not None
                ),
                None,
            )
        else:
            continue
        if parts is not None:
            earliest = min((_released[p] for p in parts), key=lambda r: r.released_at, default=_Release("", now))
            conflicts.append(_Conflict(earliest, hidden))
    return conflicts


def _conflict(cell: Cell, now: datetime, this_answer: set[Units]) -> _Conflict | None:
    """The release combination that would reveal the fewest patients, if any."""
    conflicts = [
        conflict
        for units in cell.unit_sets if units and units not in _released
        for conflict in _nested_conflicts(units, this_answer) + _recovery_conflicts(units, now)
    ]
    return min(conflicts, key=lambda c: (len(c.revealed), c.other.released_at, c.other.request_id), default=None)


def _block(cell: Cell, request_id: str, conflict: _Conflict) -> None:
    cell.shown = SUPPRESSED
    revealed = len(conflict.revealed)
    noun = "patient" if revealed == 1 else "patients"
    other = conflict.other
    source = (
        "other values in this answer" if other.request_id in ("", request_id)
        else f"{other.request_id} (released {other.released_at:%H:%M})"
    )
    cell.suppressed_by = f"differencing: combined with {source} this would reveal {revealed} {noun}"


def apply_ledger(applicant_key: str, request_id: str, result: StatResult) -> list[LedgerEvent]:
    now = datetime.now(UTC)
    new_events: list[LedgerEvent] = []
    with _lock:
        _ensure_loaded()
        cells = [(row, cell) for row in result.rows for cell in row.cells]
        this_answer: set[Units] = set()
        _withheld.update(
            units for _, cell in cells if not _is_released_number(cell)
            for units in cell.unit_sets if 0 < len(units) < MIN_CELL
        )
        for row, cell in cells:
            if not _is_released_number(cell):
                continue
            conflict = _conflict(cell, now, this_answer)
            if conflict is None:
                for units in cell.unit_sets:
                    if units and units not in _released:
                        _add_release(units, _Release(request_id, now))
                        this_answer.add(units)
                continue
            _block(cell, request_id, conflict)
            _withheld.add(conflict.revealed)
            new_events.append(LedgerEvent(
                time=now, applicant_key=applicant_key, request_id=request_id, metric=cell.metric,
                labels=dict(row.labels), other_request_id=conflict.other.request_id or request_id,
                revealed_count=len(conflict.revealed),
            ))
        _events[:] = [e for e in _events if (e.applicant_key, e.request_id) != (applicant_key, request_id)]
        _events.extend(new_events)
        _save()

    for event in new_events:
        audit.record("ledger_blocked", "system", request_id, {
            "metric": event.metric, "labels": event.labels,
            "other_request_id": event.other_request_id, "revealed_count": event.revealed_count,
        })
    return new_events


def ledger_events() -> list[LedgerEvent]:
    with _lock:
        _ensure_loaded()
        return list(_events)


def reset_ledger() -> None:
    with _lock:
        _ensure_loaded()
        _clear()
        _save()
