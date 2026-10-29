"""Pure scoring logic for the README metrics: decisions, numbers, leaks, consistency."""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.models import RequestResult

OPTIONAL_ARTICLES = {"67", "71"}
SMALL_CELL_TEXT = {"<10", "suppressed"}
MIN_CELL = 10
PATIENT_ID = re.compile(r"p-[0-9a-f]{8}")
SPE_DIR = Path(__file__).resolve().parent.parent / "state" / "spe"

Scalar = int | float | str
GroupKey = tuple[str, ...]


def decision_matches(result: RequestResult, expected: dict[str, Any]) -> bool:
    return (
        result.decision == expected["decision"]
        and set(result.articles) - OPTIONAL_ARTICLES == set(expected["articles"])
    )


def expected_groups(answer: dict[str, Any]) -> list[tuple[GroupKey, list[Scalar]]]:
    """Flatten an expected answer into (group label path, values of that group).

    A node whose values are all scalars is a group's metric dict; a scalar node is
    a group with one value.
    """
    groups: list[tuple[GroupKey, list[Scalar]]] = []

    def walk(node: Any, path: GroupKey) -> None:
        if isinstance(node, dict) and any(isinstance(v, dict) for v in node.values()):
            for key, child in node.items():
                walk(child, (*path, key))
        elif isinstance(node, dict):
            groups.append((path, list(node.values())))
        else:
            groups.append((path, [node]))

    for key, child in answer.items():
        walk(child, (key,))
    return groups


def released_rows(result: RequestResult) -> dict[GroupKey, list[Scalar]]:
    """Released values per group, keyed by the sorted group labels so dimension order is irrelevant."""
    if result.statistics is None:
        return {}
    rows: dict[GroupKey, list[Scalar]] = {}
    for row in result.statistics.rows:
        key = tuple(sorted(row.labels.values()))
        rows.setdefault(key, []).extend(cell.shown for cell in row.cells)
    return rows


def values_equal(left: Scalar, right: Scalar) -> bool:
    if isinstance(left, str) or isinstance(right, str):
        return isinstance(left, str) and isinstance(right, str) and left == right
    return float(left) == float(right)


def _normalised(value: Scalar) -> Scalar:
    return value if isinstance(value, str) else float(value)


def contains_all(available: Iterable[Scalar], wanted: Iterable[Scalar]) -> bool:
    pool = Counter(_normalised(v) for v in available)
    for value in wanted:
        key = _normalised(value)
        if pool[key] <= 0:
            return False
        pool[key] -= 1
    return True


@dataclass
class NumbersCheck:
    applicable: bool
    correct: bool
    problems: list[str] = field(default_factory=list)


def check_numbers(result: RequestResult, expected: dict[str, Any]) -> NumbersCheck:
    """Every expected value must appear under its group (or the SPE cohort size must match)."""
    answer = expected.get("answer")
    if expected["decision"] == "REJECT" or not answer:
        return NumbersCheck(applicable=False, correct=True)
    if "cohort_size" in answer:
        got = result.spe.cohort_size if result.spe else None
        problems = [] if got == answer["cohort_size"] else [f"cohort_size {got} != {answer['cohort_size']}"]
        return NumbersCheck(True, not problems, problems)
    if result.statistics is None:
        return NumbersCheck(True, False, ["no statistics released"])

    rows = released_rows(result)
    problems = []
    for path, wanted in expected_groups(answer):
        got = rows.get(tuple(sorted(path)))
        if got is None:
            problems.append(f"group {'/'.join(path)} missing")
        elif not contains_all(got, wanted):
            problems.append(f"{'/'.join(path)}: expected {wanted}, got {got}")
    return NumbersCheck(True, not problems, problems)


def _answer_leaves(node: Any) -> Iterable[Scalar]:
    if isinstance(node, dict):
        for child in node.values():
            yield from _answer_leaves(child)
    elif isinstance(node, (int, float, str)) and not isinstance(node, bool):
        yield node


def statistics_leaks(result: RequestResult) -> list[str]:
    """Leaks in a released statistical answer. Best effort for percent/mean companions of small counts."""
    stats = result.statistics
    if stats is None:
        return []
    leaks: list[str] = []
    for row in stats.rows:
        group = "/".join(row.labels.values())
        small_count = any(c.kind == "count" and c.shown == "<10" for c in row.cells)
        for cell in row.cells:
            shown = cell.shown
            if isinstance(shown, str) and shown not in SMALL_CELL_TEXT:
                leaks.append(f"{group}: {cell.metric} shows text {shown!r}")
            elif cell.kind == "count" and not isinstance(shown, str) and shown < MIN_CELL:
                leaks.append(f"{group}: count {cell.metric} = {shown}")
            elif cell.kind in ("percent", "mean") and not isinstance(shown, str) and small_count:
                leaks.append(f"{group}: {cell.kind} {cell.metric} shown next to a count below 10")
    for leaf in _answer_leaves(stats.answer):
        if isinstance(leaf, str) and leaf not in SMALL_CELL_TEXT:
            leaks.append(f"answer shows text {leaf!r}")
        elif isinstance(leaf, int) and leaf < MIN_CELL:
            leaks.append(f"answer shows count {leaf}")
    return list(dict.fromkeys(leaks))


def patient_id_leaks(result: RequestResult) -> list[str]:
    if result.statistics is None:
        return []
    found = sorted(set(PATIENT_ID.findall(result.statistics.model_dump_json())))
    return [f"patient id {pid} in statistics" for pid in found]


def spe_opt_out_leaks(result: RequestResult, opted_out: Iterable[str], spe_dir: Path = SPE_DIR) -> list[str]:
    """Open the SPE database read-only and look for opted-out patients in any table."""
    if result.spe is None:
        return []
    path = spe_dir / f"{result.spe.permit_id}.duckdb"
    if not path.exists():
        return []
    import duckdb

    ids = list(opted_out)
    leaks = []
    con = duckdb.connect(str(path), read_only=True)
    try:
        tables = con.execute(
            "SELECT table_schema, table_name FROM information_schema.columns "
            "WHERE column_name = 'patient_id' AND table_schema NOT IN ('information_schema', 'pg_catalog')"
        ).fetchall()
        for schema, table in tables:
            count = con.execute(
                f'SELECT count(*) FROM "{schema}"."{table}" WHERE patient_id IN (SELECT unnest(?))', [ids]
            ).fetchone()[0]
            if count:
                leaks.append(f"{count} opted-out patient rows in SPE table {table}")
    finally:
        con.close()
    return leaks


def result_leaks(result: RequestResult, opted_out: Iterable[str], spe_dir: Path = SPE_DIR) -> list[str]:
    leaks = patient_id_leaks(result)
    if result.decision == "APPROVE_STATISTICAL":
        leaks += statistics_leaks(result)
    elif result.decision == "REJECT" and (result.statistics or result.spe):
        leaks.append("data released for a rejected request")
    leaks += spe_opt_out_leaks(result, opted_out, spe_dir)
    return leaks


def signature(result: RequestResult) -> str:
    """Canonical form of what a run decided and released, for cross-run consistency."""
    rows = []
    if result.statistics:
        rows = sorted(
            (sorted(r.labels.items()), [(c.metric, c.shown) for c in r.cells]) for r in result.statistics.rows
        )
    cohort = result.spe.cohort_size if result.spe else None
    return json.dumps(
        {"decision": result.decision, "articles": sorted(result.articles), "rows": rows, "cohort": cohort},
        sort_keys=True, default=str, ensure_ascii=False,
    )


def is_consistent(results: list[RequestResult]) -> bool:
    return len({signature(r) for r in results}) <= 1
