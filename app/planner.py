"""Translate a request's plain-English definitions into a QueryPlan via the LLM."""

from __future__ import annotations

import re

from app.db import REFERENCE_DATE
from app.plan import QueryPlan
from app.terminology import catalog_text

PLAN_SYSTEM = f"""You translate a health data request into a QueryPlan (JSON, schema given). A deterministic \
engine runs the plan; you never see patient data and never write SQL.

Data: synthetic patients from three Austrian hospitals (data_holder: Klinikum Nord, Klinikum Süd, Klinikum West), \
nine regions (Burgenland, Kärnten, Niederösterreich, Oberösterreich, Salzburg, Steiermark, Tirol, Vorarlberg, Wien). \
Tables: patients (sex, birth_date, region, data_holder), conditions (ICD-10 diagnoses), medications (ATC, \
start_date, end_date), observations (LOINC measurements), encounters (inpatient/outpatient/emergency visits 2023-2025, \
primary_icd10 = main diagnosis of inpatient stays only). Reference date {REFERENCE_DATE.isoformat()}; age = \
2025 minus birth year. Opted-out patients are removed by the engine; never mention them.

Codes that exist in the data (map plain-English terms ONLY onto these; use the shortest prefix that captures the \
term, e.g. a 3-character ICD-10 category like "J45" or an ATC class like "C09AA"):
{catalog_text()}

Rules:
- Follow the definitions literally. Use the codes they give. If a term has no code, map it from the list above \
and add a note. Do not add restrictions the definitions do not state.
- unit: "patients" unless the request counts stays, visits or encounters -> "encounters" with encounter_filter \
(types, primary_icd10_prefixes for "main diagnosis", start_from/start_to dates).
- cohort: criteria every counted unit must meet (AND). "Adult" = age min_age 18. "in <region>" = region criterion. \
"Women" = sex female. A diagnosis means any row in conditions (ConditionCriterion); only "main diagnosis" of a \
stay uses primary_icd10.
- Medication "active" = MedicationCriterion with active_on {REFERENCE_DATE.isoformat()}. "No active X" = the same \
criterion with negate true. Taken "at any time in" a period = overlaps_from/overlaps_to; "started in" a period = \
started_from/started_to. A diagnosis first recorded in a period = ConditionCriterion onset_from/onset_to.
- "patients without a value are left out" or "who have a value" = an ObservationCriterion in the cohort. "Latest \
value" = MeanMetric which "latest". A threshold on a measurement ("eGFR below 60") = ObservationCriterion with \
comparator and value (applies to the latest value).
- group_by: one entry per "per X"/"by X" dimension, in the order stated. region; data_holder for hospital; sex; \
age_band with the exact band labels from the request ("80+" -> max_age null); encounter_type; start_year.
- metrics: one per reported number, in the order of the "Report" definition. Name each metric mechanically from \
the words the Report definition uses for it: lowercase, drop leading articles and "how many"/"number of"/"of them", \
"%" or "share in %" -> suffix "_pct", "mean X" -> "mean_x", digits kept, every other non-alphanumeric run -> "_" \
(e.g. "adults with type 2 diabetes" -> adults_with_type_2_diabetes; "that share in %" for patients without X -> \
without_x_pct). A PercentMetric name always ends in "_pct" (prevalence -> prevalence_pct); a MeanMetric name \
always starts with "mean_". Never invent synonyms. The group population itself is a CountMetric \
with no where. A sub-count adds `where`. A share/prevalence/% is a PercentMetric: numerator_where = what is \
counted; denominator = the group population (denominator_where empty) unless stated otherwise. A mean of a \
measurement is a MeanMetric. For stays use CountMetric on encounters; for distinct patients set \
distinct_patients. With unit "encounters", an EncounterCriterion inside a metric's where describes the \
counted stay itself (e.g. heart-failure stays among all inpatient stays: encounter_filter types inpatient, \
metric where [encounter primary_icd10_prefixes I50]). A mean of values measured in a period = MeanMetric \
date_from/date_to.
- Report only the numbers the request asks for; never add an unrequested population count. A metric with a where \
is never named just "patients" or "count".
- Access applications for records: put the selected patients in cohort and list the record types the request \
names in spe_records (patients, conditions, medications, observations, encounters). If only some measurements are \
requested (e.g. "HbA1c values"), restrict observations with codes. If the request also defines numbers to report \
per group, fill group_by and metrics as well. "Report the size of the cohort" needs no metric.
- Health data requests (statistics) never need spe_records.
- Put any assumption you made in notes (short).
- If a requested number cannot be expressed with this plan (a median, a rate per 1,000, grouping by drug or \
diagnosis code, a sum, a time trend not covered by start_year), set unsupported to a one-sentence explanation \
instead of approximating it. Never approximate silently."""

EXAMPLE = """Example (not one of the real requests):
Definitions: "Chronic kidney disease = ICD-10 starting with N18." / "Use the latest eGFR (LOINC 62238-1); patients \
without one are left out." / "Report per hospital and sex: patients and mean eGFR, one decimal."
Plan: {"unit":"patients","cohort":[{"kind":"condition","icd10_prefixes":["N18"]},{"kind":"observation",\
"loinc":"62238-1"}],"group_by":[{"dimension":"data_holder"},{"dimension":"sex"}],"metrics":[{"kind":"count",\
"name":"patients"},{"kind":"mean","name":"mean_egfr","of":"observation","loinc":"62238-1","which":"latest"}],\
"spe_records":[],"notes":[]}"""


def plan_prompt(request_text: str) -> str:
    return f"{EXAMPLE}\n\nNow produce the QueryPlan for this request:\n{request_text}"


# Words the model adds or drops inconsistently when naming the same reported number.
_FILLER = {"a", "an", "the", "how", "many", "number", "of", "them", "that", "who", "which", "have", "has",
           "having", "are", "is", "count", "share", "in"}
_SYNONYMS = {"without": "no", "percent": "pct", "percentage": "pct", "average": "mean"}
_PRECISION = re.compile(r",?\s*(with |to |rounded to )?(one|1|two|2) decimals?", re.IGNORECASE)


def canonical_metric_name(name: str) -> str:
    tokens = [_SYNONYMS.get(t, t) for t in re.split(r"[^a-z0-9]+", name.lower().replace("%", " pct ")) if t]
    kept = [t for t in tokens if t not in _FILLER]
    if "pct" in kept:
        kept = [t for t in kept if t != "pct"] + ["pct"]
    return "_".join(kept) or name


_LISTING = re.compile(r"^\s*(report\b|.*\b(per|for each|by)\s+[\w\s×x-]+:)", re.IGNORECASE)


def report_phrases(definitions: list[str]) -> list[str] | None:
    """The reported numbers, in order, as a "Report per X: a, b and c" style definition lists them."""
    report = next((d for d in definitions if ":" in d and _LISTING.match(d)), None)
    if report is None:
        return None
    listed = _PRECISION.sub("", report.split(":", 1)[1]).strip().rstrip(".")
    phrases = [p.strip() for p in re.split(r",(?!\d)\s*(?:and\s+)?|\s+and\s+", listed) if p.strip()]
    return phrases or None


def _names_from_report(phrases: list[str], plan: QueryPlan) -> list[str]:
    names: list[str] = []
    for phrase, metric in zip(phrases, plan.metrics, strict=True):
        lowered = phrase.lower()
        if names and re.match(r"(that|this|the|their)\b.*\b(share|percentage|proportion)\b", lowered):
            name = f"{names[-1]}_pct"
        else:
            name = canonical_metric_name(phrase)
        if metric.kind == "percent" and not name.endswith("pct"):
            name += "_pct"
        names.append(name)
    return names


def with_canonical_names(plan: QueryPlan, definitions: list[str] | None = None) -> QueryPlan:
    """Same reported number, same key, whatever wording the model chose.

    Names come from the request's own Report definition when it lists exactly one phrase per
    metric; otherwise the model's names are normalised.
    """
    phrases = report_phrases(definitions or [])
    if phrases and len(phrases) == len(plan.metrics):
        names = _names_from_report(phrases, plan)
    else:
        names = [canonical_metric_name(m.name) for m in plan.metrics]
    seen: set[str] = set()
    metrics = []
    for metric, name in zip(plan.metrics, names, strict=True):
        while name in seen:
            name += "_2"
        seen.add(name)
        metrics.append(metric.model_copy(update={"name": name}))
    return plan.model_copy(update={"metrics": metrics})
