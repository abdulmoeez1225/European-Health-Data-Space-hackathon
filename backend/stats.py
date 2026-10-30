"""Run a compiled plan and aggregate it into small-cell-protected statistics.

Small-cell rule:
- every requested group is shown, even if empty;
- counts below 10 (including 0) are shown as "<10";
- a percentage whose numerator or denominator is below 10 is "suppressed";
- a mean of fewer than 10 patients is "suppressed";
- values are rounded to one decimal, halves up.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import get_args

from backend.compiler import cohort_sql, compile_plan
from backend.db import connection
from backend.plan import (
    CountMetric,
    DataHolder,
    EncounterType,
    GroupBy,
    MeanMetric,
    PercentMetric,
    QueryPlan,
    Region,
)

MIN_CELL = 10
LESS_THAN = "<10"
SUPPRESSED = "suppressed"

Shown = int | float | str


def round_half_up(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


@dataclass
class Cell:
    """One released value plus the unit sets it was computed from.

    `unit_sets` never leave the app; the release ledger uses them to detect
    differencing between releases.
    """

    metric: str
    kind: str
    shown: Shown
    exact: str
    unit_sets: list[frozenset[str]] = field(default_factory=list, repr=False)
    suppressed_by: str | None = None


@dataclass
class GroupRow:
    labels: dict[str, str]
    cells: list[Cell]


@dataclass
class StatResult:
    sql: str
    dimensions: list[str]
    rows: list[GroupRow]

    def answer(self) -> dict:
        """Nested {group: {subgroup: {metric: value}}} view of the released values."""
        if not self.dimensions:
            return {cell.metric: cell.shown for cell in self.rows[0].cells} if self.rows else {}
        answer: dict = {}
        for row in self.rows:
            node = answer
            for dim in self.dimensions:
                node = node.setdefault(row.labels[dim], {})
            for cell in row.cells:
                node[cell.metric] = cell.shown
        return answer


def _domain(group: GroupBy, plan: QueryPlan) -> list[str]:
    match group.dimension:
        case "region":
            return list(get_args(Region))
        case "data_holder":
            return list(get_args(DataHolder))
        case "sex":
            return ["female", "male"]
        case "age_band":
            return [band.label for band in group.age_bands or []]
        case "encounter_type":
            return list(get_args(EncounterType))
        case "start_year":
            flt = plan.encounter_filter
            first = flt.start_from.year if flt and flt.start_from else 2023
            last = flt.start_to.year if flt and flt.start_to else 2025
            return [str(year) for year in range(first, last + 1)]
    raise ValueError(group.dimension)


def _count_cell(name: str, units: set[str]) -> Cell:
    n = len(units)
    return Cell(name, "count", n if n >= MIN_CELL else LESS_THAN, str(n), [frozenset(units)])


def _percent_cell(name: str, numerator: set[str], denominator: set[str]) -> Cell:
    num, den = len(numerator), len(denominator)
    exact = f"{num}/{den}"
    sets = [frozenset(numerator), frozenset(denominator)]
    if num < MIN_CELL or den < MIN_CELL:
        return Cell(name, "percent", SUPPRESSED, exact, sets)
    return Cell(name, "percent", round_half_up(Decimal(num) * 100 / Decimal(den)), exact, sets)


def _mean_cell(name: str, values: dict[str, Decimal]) -> Cell:
    n = len(values)
    if n == 0:
        return Cell(name, "mean", SUPPRESSED, "n=0", [frozenset()])
    total = sum(values.values(), Decimal(0))
    exact = f"{total}/{n}"
    if n < MIN_CELL:
        return Cell(name, "mean", SUPPRESSED, exact, [frozenset(values)])
    return Cell(name, "mean", round_half_up(total / n), exact, [frozenset(values)])


def run_plan(plan: QueryPlan) -> StatResult:
    compiled = compile_plan(plan)
    con = connection()
    cursor = con.execute(compiled.sql)
    names = [d[0] for d in cursor.description]
    records = [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]

    dims: list[str] = [g.dimension for g in plan.group_by]
    domains = [_domain(g, plan) for g in plan.group_by]
    buckets: dict[tuple, list[dict]] = {key: [] for key in itertools.product(*domains)}
    for record in records:
        key = tuple(record[col] for col in compiled.group_columns)
        if key in buckets:
            buckets[key].append(record)

    rows = []
    for key, members in buckets.items():
        cells = []
        for index, metric in enumerate(plan.metrics):
            match metric:
                case CountMetric():
                    field_name = "patient_id" if metric.distinct_patients else "unit_id"
                    cells.append(_count_cell(metric.name, {r[field_name] for r in members if r[f"m{index}_in"]}))
                case PercentMetric():
                    cells.append(_percent_cell(
                        metric.name,
                        {r["unit_id"] for r in members if r[f"m{index}_num"]},
                        {r["unit_id"] for r in members if r[f"m{index}_den"]},
                    ))
                case MeanMetric():
                    values = {r["unit_id"]: r[f"m{index}_val"] for r in members if r[f"m{index}_val"] is not None}
                    cells.append(_mean_cell(metric.name, values))
        rows.append(GroupRow(labels=dict(zip(dims, key, strict=True)), cells=cells))

    return StatResult(sql=compiled.sql, dimensions=dims, rows=rows)


def cohort_size(plan: QueryPlan) -> int:
    row = connection().execute(f"SELECT count(*) FROM ({cohort_sql(plan)})").fetchone()
    assert row is not None
    return int(row[0])
