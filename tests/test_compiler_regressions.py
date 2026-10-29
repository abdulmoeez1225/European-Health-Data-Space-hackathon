"""Regressions found by the stress test on unseen requests (eval/stress/FINDINGS.md)."""

from backend.db import connection
from backend.plan import QueryPlan
from backend.stats import run_plan


def _sql(query: str) -> dict[str, int]:
    return dict(connection().execute(query).fetchall())


def test_encounter_criterion_in_a_stay_metric_counts_only_matching_stays() -> None:
    plan = QueryPlan.model_validate({
        "unit": "encounters",
        "encounter_filter": {"types": ["inpatient"]},
        "group_by": [{"dimension": "data_holder"}],
        "metrics": [{"kind": "count", "name": "heart_failure_stays",
                     "where": [{"kind": "encounter", "primary_icd10_prefixes": ["I50"]}]}],
    })
    truth = _sql("SELECT data_holder, count(*) FROM encounters "
                 "WHERE type = 'inpatient' AND primary_icd10 LIKE 'I50%' GROUP BY 1")
    answer = run_plan(plan).answer()
    assert {holder: cells["heart_failure_stays"] for holder, cells in answer.items()} == truth


def test_medication_taken_at_any_time_in_a_period() -> None:
    plan = QueryPlan.model_validate({
        "cohort": [{"kind": "medication", "atc_prefixes": ["A10BA"],
                    "overlaps_from": "2024-01-01", "overlaps_to": "2024-12-31"}],
        "group_by": [{"dimension": "sex"}],
        "metrics": [{"kind": "count", "name": "on_metformin_in_2024"}],
    })
    truth = _sql("""SELECT p.sex, count(*) FROM patients p WHERE EXISTS (
        SELECT 1 FROM medications m WHERE m.patient_id = p.patient_id AND m.atc LIKE 'A10BA%'
        AND m.start_date <= DATE '2024-12-31' AND (m.end_date IS NULL OR m.end_date >= DATE '2024-01-01'))
        GROUP BY 1""")
    answer = run_plan(plan).answer()
    assert {sex: cells["on_metformin_in_2024"] for sex, cells in answer.items()} == truth


def test_mean_of_latest_value_within_a_period() -> None:
    plan = QueryPlan.model_validate({
        "cohort": [{"kind": "condition", "icd10_prefixes": ["E11"]},
                   {"kind": "observation", "loinc": "4548-4", "date_from": "2023-01-01", "date_to": "2023-12-31"}],
        "metrics": [{"kind": "mean", "name": "mean_hba1c_2023", "loinc": "4548-4",
                     "date_from": "2023-01-01", "date_to": "2023-12-31"}],
    })
    exact = connection().execute("""
        WITH latest AS (
            SELECT o.patient_id, arg_max(o.value, o.date) AS v FROM observations o
            WHERE o.loinc = '4548-4' AND o.date BETWEEN DATE '2023-01-01' AND DATE '2023-12-31'
              AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = o.patient_id AND c.icd10 LIKE 'E11%')
            GROUP BY o.patient_id)
        SELECT sum(v), count(*) FROM latest""").fetchone()
    cell = run_plan(plan).rows[0].cells[0]
    assert cell.exact == f"{exact[0]}/{exact[1]}"
