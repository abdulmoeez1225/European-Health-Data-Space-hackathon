"""Compile a QueryPlan into one SQL statement over the eligible-patient views.

The statement returns one row per unit (patient or encounter) with its group
labels and, per metric, the flags and values needed to aggregate it. All
aggregation and the small-cell rule happen afterwards in `stats.py`.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.plan import (
    AgeBand,
    AgeCriterion,
    ConditionCriterion,
    CountMetric,
    Criterion,
    DataHolderCriterion,
    EncounterCriterion,
    EncounterFilter,
    GroupBy,
    MeanMetric,
    MedicationCriterion,
    ObservationCriterion,
    PercentMetric,
    QueryPlan,
    RegionCriterion,
    SexCriterion,
)


def _str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _date(value: date) -> str:
    return f"DATE '{value.isoformat()}'"


def _prefixes(column: str, prefixes: Sequence[str]) -> str:
    return "(" + " OR ".join(f"{column} LIKE {_str(p.upper() + '%')}" for p in prefixes) + ")"


def _and(parts: list[str]) -> str:
    return " AND ".join(f"({p})" for p in parts) if parts else "TRUE"


def _range(column: str, start: date | None, end: date | None) -> list[str]:
    parts = []
    if start:
        parts.append(f"{column} >= {_date(start)}")
    if end:
        parts.append(f"{column} <= {_date(end)}")
    return parts


def _latest_value(loinc: str, which: str = "latest", extra: list[str] | None = None) -> str:
    order = "DESC" if which == "latest" else "ASC"
    where = _and(["o.patient_id = p.patient_id", f"o.loinc = {_str(loinc)}", *(extra or [])])
    return f"(SELECT o.value FROM observations o WHERE {where} ORDER BY o.date {order} LIMIT 1)"


def _encounter_conditions(
    alias: str, types: Sequence[str] | None, prefixes: Sequence[str] | None,
    start_from: date | None, start_to: date | None,
) -> list[str]:
    parts = []
    if types:
        parts.append(f"{alias}.type IN ({', '.join(_str(t) for t in types)})")
    if prefixes:
        parts.append(_prefixes(f"{alias}.primary_icd10", prefixes))
    parts += _range(f"{alias}.start_date", start_from, start_to)
    return parts


def criterion_sql(criterion: Criterion) -> str:
    """Boolean SQL expression over the patient alias `p`."""
    sql = _positive_sql(criterion)
    return f"NOT ({sql})" if criterion.negate else sql


def _positive_sql(criterion: Criterion) -> str:
    match criterion:
        case AgeCriterion(min_age=lo, max_age=hi):
            parts = []
            if lo is not None:
                parts.append(f"p.age >= {int(lo)}")
            if hi is not None:
                parts.append(f"p.age <= {int(hi)}")
            return _and(parts)
        case SexCriterion(sex=sex):
            return f"p.sex = {_str(sex)}"
        case RegionCriterion(regions=regions):
            return f"p.region IN ({', '.join(_str(r) for r in regions)})"
        case DataHolderCriterion(data_holders=holders):
            return f"p.data_holder IN ({', '.join(_str(h) for h in holders)})"
        case ConditionCriterion():
            where = _and([
                "c.patient_id = p.patient_id",
                _prefixes("c.icd10", criterion.icd10_prefixes),
                *_range("c.onset_date", criterion.onset_from, criterion.onset_to),
            ])
            return f"EXISTS (SELECT 1 FROM conditions c WHERE {where})"
        case MedicationCriterion():
            parts = ["m.patient_id = p.patient_id", _prefixes("m.atc", criterion.atc_prefixes)]
            if criterion.active_on:
                day = _date(criterion.active_on)
                parts += [f"m.start_date <= {day}", f"(m.end_date IS NULL OR m.end_date >= {day})"]
            parts += _range("m.start_date", criterion.started_from, criterion.started_to)
            return f"EXISTS (SELECT 1 FROM medications m WHERE {_and(parts)})"
        case ObservationCriterion():
            dates = _range("o.date", criterion.date_from, criterion.date_to)
            if criterion.comparator is None:
                where = _and(["o.patient_id = p.patient_id", f"o.loinc = {_str(criterion.loinc)}", *dates])
                return f"EXISTS (SELECT 1 FROM observations o WHERE {where})"
            assert criterion.value is not None  # guaranteed by the model validator
            latest = _latest_value(criterion.loinc, extra=dates)
            return f"COALESCE({latest} {criterion.comparator} {float(criterion.value)}, FALSE)"
        case EncounterCriterion():
            parts = ["x.patient_id = p.patient_id", *_encounter_conditions(
                "x", criterion.types, criterion.primary_icd10_prefixes,
                criterion.start_from, criterion.start_to,
            )]
            return f"(SELECT count(*) FROM encounters x WHERE {_and(parts)}) >= {int(criterion.min_count)}"
    raise ValueError(f"unsupported criterion {criterion!r}")


def _all(criteria: list[Criterion]) -> str:
    return _and([criterion_sql(c) for c in criteria])


def _age_band_case(bands: list[AgeBand]) -> str:
    whens = []
    for band in bands:
        upper = f" AND p.age <= {int(band.max_age)}" if band.max_age is not None else ""
        whens.append(f"WHEN p.age >= {int(band.min_age)}{upper} THEN {_str(band.label)}")
    return "CASE " + " ".join(whens) + " END"


def _group_sql(group: GroupBy, unit: str) -> str:
    match group.dimension:
        case "region":
            return "p.region"
        case "data_holder":
            return "e.data_holder" if unit == "encounters" else "p.data_holder"
        case "sex":
            return "p.sex"
        case "age_band":
            return _age_band_case(group.age_bands or [])
        case "encounter_type":
            return "e.type"
        case "start_year":
            return "CAST(year(e.start_date) AS VARCHAR)"
    raise ValueError(f"unsupported group {group.dimension}")


@dataclass(frozen=True)
class CompiledQuery:
    sql: str
    group_columns: list[str]


def compile_plan(plan: QueryPlan) -> CompiledQuery:
    encounters = plan.unit == "encounters"
    if not encounters and any(g.dimension in ("encounter_type", "start_year") for g in plan.group_by):
        raise ValueError("encounter_type and start_year grouping need unit 'encounters'")

    columns = ["e.encounter_id AS unit_id" if encounters else "p.patient_id AS unit_id", "p.patient_id"]
    group_columns = []
    for index, group in enumerate(plan.group_by):
        columns.append(f"{_group_sql(group, plan.unit)} AS g{index}")
        group_columns.append(f"g{index}")

    for index, metric in enumerate(plan.metrics):
        match metric:
            case CountMetric():
                columns.append(f"{_all(metric.where)} AS m{index}_in")
            case PercentMetric():
                denominator = _all(metric.denominator_where)
                columns.append(f"{denominator} AS m{index}_den")
                columns.append(f"({denominator}) AND ({_all(metric.numerator_where)}) AS m{index}_num")
            case MeanMetric():
                if metric.of == "length_of_stay_days":
                    if not encounters:
                        raise ValueError("length_of_stay_days needs unit 'encounters'")
                    value = "CAST(date_diff('day', e.start_date, e.end_date) AS DECIMAL(12,4))"
                else:
                    value = _latest_value(metric.loinc or "", metric.which)
                columns.append(f"CASE WHEN {_all(metric.where)} THEN {value} END AS m{index}_val")

    where = [criterion_sql(c) for c in plan.cohort]
    if encounters:
        source = "encounters e JOIN patients p ON p.patient_id = e.patient_id"
        flt = plan.encounter_filter or EncounterFilter()
        where = _encounter_conditions("e", flt.types, flt.primary_icd10_prefixes, flt.start_from, flt.start_to) + where
    else:
        source = "patients p"

    select = ",\n       ".join(columns)
    sql = f"SELECT {select}\nFROM {source}\nWHERE {_and(where)}"
    return CompiledQuery(sql=sql, group_columns=group_columns)


def cohort_sql(plan: QueryPlan) -> str:
    """Distinct patient IDs selected by the plan's cohort (used for SPE extracts)."""
    return f"SELECT DISTINCT p.patient_id FROM patients p WHERE {_all(plan.cohort)}"
