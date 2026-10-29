"""Code catalog built from the data: which ICD-10, ATC and LOINC codes exist.

The LLM maps plain-English terms only onto these codes, and staff see which
data codes each prefix in a plan actually matches. Only code lists and labels
are shared with the LLM, never patient rows or counts.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from app.db import connection
from app.models import CodeMapping
from app.plan import (
    ConditionCriterion,
    CountMetric,
    Criterion,
    EncounterCriterion,
    MeanMetric,
    MedicationCriterion,
    ObservationCriterion,
    PercentMetric,
    QueryPlan,
)

# Main diagnoses of inpatient stays that do not occur in conditions.csv carry no label in the data.
_ENCOUNTER_ONLY_LABELS = {
    "J18.9": "Pneumonia, unspecified organism",
    "K35.8": "Acute appendicitis, other and unspecified",
    "N39.0": "Urinary tract infection, site not specified",
    "S72.0": "Fracture of neck of femur",
}


@dataclass(frozen=True)
class CatalogEntry:
    system: str
    code: str
    label: str
    source: str


@lru_cache(maxsize=1)
def catalog() -> tuple[CatalogEntry, ...]:
    con = connection()
    entries: list[CatalogEntry] = []
    for code, label in con.execute("SELECT DISTINCT icd10, description FROM raw_conditions ORDER BY 1").fetchall():
        entries.append(CatalogEntry("ICD-10", code, label, "diagnosis (conditions)"))
    known = {e.code for e in entries}
    for (code,) in con.execute(
        "SELECT DISTINCT primary_icd10 FROM raw_encounters WHERE primary_icd10 IS NOT NULL ORDER BY 1"
    ).fetchall():
        if code not in known:
            label = _ENCOUNTER_ONLY_LABELS.get(code, "")
            entries.append(CatalogEntry("ICD-10", code, label, "inpatient main diagnosis only"))
    for code, label in con.execute("SELECT DISTINCT atc, name FROM raw_medications ORDER BY 1").fetchall():
        entries.append(CatalogEntry("ATC", code, label, "prescription"))
    for code, label, unit in con.execute(
        "SELECT DISTINCT loinc, name, unit FROM raw_observations ORDER BY 1"
    ).fetchall():
        entries.append(CatalogEntry("LOINC", code, f"{label} [{unit}]", "measurement"))
    return tuple(entries)


def catalog_text() -> str:
    lines = []
    for system in ("ICD-10", "ATC", "LOINC"):
        lines.append(f"{system}:")
        lines += [f"  {e.code}  {e.label}  ({e.source})" for e in catalog() if e.system == system]
    return "\n".join(lines)


def _plan_prefixes(plan: QueryPlan) -> list[tuple[str, str]]:
    criteria: list[Criterion] = list(plan.cohort)
    for metric in plan.metrics:
        match metric:
            case CountMetric() | MeanMetric():
                criteria += metric.where
            case PercentMetric():
                criteria += metric.numerator_where + metric.denominator_where
    found: list[tuple[str, str]] = []
    for criterion in criteria:
        match criterion:
            case ConditionCriterion():
                found += [("ICD-10", p) for p in criterion.icd10_prefixes]
            case MedicationCriterion():
                found += [("ATC", p) for p in criterion.atc_prefixes]
            case ObservationCriterion():
                found.append(("LOINC", criterion.loinc))
            case EncounterCriterion() if criterion.primary_icd10_prefixes:
                found += [("ICD-10", p) for p in criterion.primary_icd10_prefixes]
    if plan.encounter_filter and plan.encounter_filter.primary_icd10_prefixes:
        found += [("ICD-10", p) for p in plan.encounter_filter.primary_icd10_prefixes]
    for metric in plan.metrics:
        if isinstance(metric, MeanMetric) and metric.loinc:
            found.append(("LOINC", metric.loinc))
    for record in plan.spe_records:
        system = {"conditions": "ICD-10", "medications": "ATC", "observations": "LOINC", "encounters": "ICD-10"}.get(
            record.table
        )
        if system:
            found += [(system, p) for p in record.codes or []]
    return list(dict.fromkeys(found))


def map_codes(plan: QueryPlan) -> list[CodeMapping]:
    mappings = []
    for system, prefix in _plan_prefixes(plan):
        if system == "LOINC":
            matched = [e for e in catalog() if e.system == system and e.code == prefix]
        else:
            matched = [e for e in catalog() if e.system == system and e.code.upper().startswith(prefix.upper())]
        mappings.append(CodeMapping(
            system=system, prefix=prefix, matched=[f"{e.code} {e.label}".strip() for e in matched],
        ))
    return mappings
