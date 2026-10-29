"""Reference plans for the six approved requests.

Test fixtures only: they pin the compiler and small-cell rule against
expected.json independently of the LLM. The app never uses them.
"""

from datetime import date

from backend.plan import QueryPlan

REF = date(2025, 12, 31)
ADULT = {"kind": "age", "min_age": 18}
T2D = {"kind": "condition", "icd10_prefixes": ["E11"]}
REGION = {"dimension": "region"}


def bands(*spec: tuple[str, int, int | None]) -> dict:
    age_bands = [{"label": label, "min_age": lo, "max_age": hi} for label, lo, hi in spec]
    return {"dimension": "age_band", "age_bands": age_bands}


REFERENCE_PLANS = {
    "R01": QueryPlan.model_validate({
        "cohort": [ADULT],
        "group_by": [REGION],
        "metrics": [
            {"kind": "count", "name": "adults"},
            {"kind": "count", "name": "type2_diabetes", "where": [T2D]},
            {"kind": "percent", "name": "prevalence_pct", "numerator_where": [T2D]},
        ],
    }),
    "R03": QueryPlan.model_validate({
        "cohort": [{"kind": "condition", "icd10_prefixes": ["I48"]}, {"kind": "age", "min_age": 65}],
        "group_by": [bands(("65-74", 65, 74), ("75-84", 75, 84), ("85+", 85, None))],
        "metrics": [
            {"kind": "count", "name": "af_patients"},
            {"kind": "count", "name": "without_oac", "where": [
                {"kind": "medication", "atc_prefixes": ["B01AA", "B01AF"], "active_on": REF, "negate": True}]},
            {"kind": "percent", "name": "share_without_oac_pct", "numerator_where": [
                {"kind": "medication", "atc_prefixes": ["B01AA", "B01AF"], "active_on": REF, "negate": True}]},
        ],
    }),
    "R05": QueryPlan.model_validate({
        "cohort": [ADULT, T2D, {"kind": "observation", "loinc": "4548-4"}],
        "spe_records": [
            {"table": "conditions"}, {"table": "medications"}, {"table": "observations", "codes": ["4548-4"]},
        ],
    }),
    "R07": QueryPlan.model_validate({
        "unit": "encounters",
        "encounter_filter": {"types": ["inpatient"], "start_from": date(2025, 1, 1), "start_to": REF},
        "group_by": [REGION],
        "metrics": [{"kind": "count", "name": "inpatient_stays"}],
    }),
    "R08": QueryPlan.model_validate({
        "cohort": [{"kind": "condition", "icd10_prefixes": ["C50"]}, {"kind": "sex", "sex": "female"},
                   {"kind": "observation", "loinc": "39156-5"}],
        "group_by": [REGION],
        "metrics": [
            {"kind": "count", "name": "women_with_bmi"},
            {"kind": "mean", "name": "mean_bmi", "loinc": "39156-5"},
        ],
    }),
    "R09": QueryPlan.model_validate({
        "cohort": [ADULT, {"kind": "condition", "icd10_prefixes": ["I10"]}],
        "group_by": [bands(("18-49", 18, 49), ("50-64", 50, 64), ("65+", 65, None))],
        "metrics": [
            {"kind": "count", "name": "adults_with_hypertension"},
            {"kind": "percent", "name": "ace_inhibitor_pct",
             "numerator_where": [{"kind": "medication", "atc_prefixes": ["C09AA"], "active_on": REF}]},
            {"kind": "percent", "name": "arb_pct",
             "numerator_where": [{"kind": "medication", "atc_prefixes": ["C09CA"], "active_on": REF}]},
        ],
    }),
}
