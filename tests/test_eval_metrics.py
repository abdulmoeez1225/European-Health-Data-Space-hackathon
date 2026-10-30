import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import duckdb
import pytest

from backend.db import connection
from backend.models import (
    PurposeAssessment,
    ReleasedCell,
    ReleasedRow,
    RequestResult,
    SpeOutput,
    StatisticsOutput,
)
from backend.plan import QueryPlan
from backend.stats import cohort_size, run_plan
from eval import metrics, run_eval
from tests.reference_plans import ADULT, REF, REFERENCE_PLANS, REGION

HIDDEN_DIR = Path(run_eval.__file__).resolve().parent / "hidden"
HIDDEN_EXPECTED = json.loads((HIDDEN_DIR / "expected.json").read_text())

DATA_HOLDER = {"dimension": "data_holder"}
SEX = {"dimension": "sex"}


def _stays(prefix: str | None, types: list[str], start: date, end: date) -> dict:
    flt: dict[str, Any] = {"types": types, "start_from": start, "start_to": end}
    if prefix:
        flt["primary_icd10_prefixes"] = [prefix]
    return {"unit": "encounters", "encounter_filter": flt}


def _bands(*spec: tuple[str, int, int | None]) -> dict:
    age_bands = [{"label": label, "min_age": lo, "max_age": hi} for label, lo, hi in spec]
    return {"dimension": "age_band", "age_bands": age_bands}


def _egfr_below(value: float) -> dict:
    return {"kind": "observation", "loinc": "62238-1", "comparator": "<", "value": value}


def _active(atc: str) -> dict:
    return {"kind": "medication", "atc_prefixes": [atc], "active_on": REF}


HIDDEN_PLANS: dict[str, QueryPlan] = {
    "H01": QueryPlan.model_validate({
        **_stays("I50", ["inpatient"], date(2025, 1, 1), REF), "group_by": [DATA_HOLDER],
        "metrics": [
            {"kind": "count", "name": "heart_failure_stays"},
            {"kind": "mean", "name": "mean_length_of_stay_days", "of": "length_of_stay_days"},
        ],
    }),
    "H02": QueryPlan.model_validate({
        **_stays("S72", ["inpatient"], date(2023, 1, 1), REF), "group_by": [DATA_HOLDER],
        "metrics": [
            {"kind": "count", "name": "hip_fracture_stays"},
            {"kind": "count", "name": "stays_aged_65_plus", "where": [{"kind": "age", "min_age": 65}]},
            {"kind": "percent", "name": "share_aged_65_plus_pct",
             "numerator_where": [{"kind": "age", "min_age": 65}]},
        ],
    }),
    "H03": QueryPlan.model_validate({
        "unit": "encounters",
        "encounter_filter": {"types": ["inpatient"], "primary_icd10_prefixes": ["J18"]},
        "group_by": [SEX],
        "metrics": [
            {"kind": "count", "name": "pneumonia_stays"},
            {"kind": "count", "name": "pneumonia_patients", "distinct_patients": True},
        ],
    }),
    "H04": QueryPlan.model_validate({
        **_stays(None, ["emergency"], date(2025, 1, 1), REF), "group_by": [DATA_HOLDER],
        "metrics": [
            {"kind": "count", "name": "emergency_visits"},
            {"kind": "count", "name": "visits_aged_75_plus", "where": [{"kind": "age", "min_age": 75}]},
        ],
    }),
    "H05": QueryPlan.model_validate({
        "cohort": [ADULT, {"kind": "observation", "loinc": "62238-1"}],
        "group_by": [REGION],
        "metrics": [
            {"kind": "count", "name": "adults_with_egfr"},
            {"kind": "count", "name": "adults_egfr_below_60", "where": [_egfr_below(60)]},
            {"kind": "count", "name": "adults_egfr_below_45", "where": [_egfr_below(45)]},
            {"kind": "percent", "name": "share_below_45_pct", "numerator_where": [_egfr_below(45)]},
        ],
    }),
    "H06": QueryPlan.model_validate({
        "cohort": [ADULT, {"kind": "condition", "icd10_prefixes": ["I10"]},
                   {"kind": "observation", "loinc": "8480-6"}],
        "group_by": [SEX],
        "metrics": [
            {"kind": "count", "name": "hypertensives_with_sbp"},
            {"kind": "mean", "name": "mean_systolic_bp", "loinc": "8480-6"},
        ],
    }),
    "H07": QueryPlan.model_validate({
        "cohort": [{"kind": "condition", "icd10_prefixes": ["J45"]}],
        "group_by": [_bands(("0-17", 0, 17), ("18-39", 18, 39), ("40-64", 40, 64), ("65+", 65, None))],
        "metrics": [
            {"kind": "count", "name": "asthma_patients"},
            {"kind": "percent", "name": "share_laba_ics_pct", "numerator_where": [_active("R03AK")]},
        ],
    }),
    "H08": QueryPlan.model_validate({
        "cohort": [{"kind": "condition", "icd10_prefixes": ["N18"]}],
        "group_by": [DATA_HOLDER, SEX],
        "metrics": [
            {"kind": "count", "name": "ckd_patients"},
            {"kind": "mean", "name": "mean_egfr", "loinc": "62238-1"},
        ],
    }),
    "H11": QueryPlan.model_validate({
        "cohort": [ADULT, {"kind": "encounter", "types": ["inpatient"], "primary_icd10_prefixes": ["I50"],
                           "start_from": date(2023, 1, 1), "start_to": REF}],
        "spe_records": [{"table": "conditions"}, {"table": "medications"},
                        {"table": "observations", "codes": ["62238-1"]}, {"table": "encounters"}],
    }),
    "H12": QueryPlan.model_validate({
        "cohort": [ADULT, {"kind": "condition", "icd10_prefixes": ["J44"]}],
        "group_by": [DATA_HOLDER],
        "metrics": [
            {"kind": "count", "name": "copd_adults"},
            {"kind": "percent", "name": "tiotropium_pct", "numerator_where": [_active("R03BB04")]},
        ],
    }),
}

ALL_PLANS = {**REFERENCE_PLANS, **HIDDEN_PLANS}
REJECTED = {"R02", "R04", "R06", "R10", "H09", "H10"}
SPE_REQUESTS = {"R05", "H11"}

ASSESSMENT = PurposeAssessment(
    prohibited=False, prohibited_ground="none", allowed_purpose="scientific_research",
    records_justified=False, justification="-", explanation_for_applicant="-",
)


def _result(decision: str = "APPROVE_STATISTICAL", articles: list[str] | None = None, **kwargs: Any) -> RequestResult:
    return RequestResult(
        request_id="X", request={}, decision=decision, articles=articles or ["53", "69"], reason="-",
        legal_basis=[], assessment=ASSESSMENT, llm_backend="fake", processed_at=datetime(2026, 1, 1), **kwargs,
    )


def _stats(
    rows: list[tuple[dict[str, str], list[tuple[str, str, Any]]]], answer: dict | None = None
) -> StatisticsOutput:
    released = [
        ReleasedRow(labels=labels, cells=[ReleasedCell(metric=m, kind=k, shown=v) for m, k, v in cells])
        for labels, cells in rows
    ]
    return StatisticsOutput(dimensions=[], rows=released, answer=answer or {}, sql="", privacy_checks=[])


def fake_process(request: dict[str, Any], *, use_cache: bool = True) -> RequestResult:
    request_id = request["id"]
    if request_id in REJECTED:
        return _result("REJECT", ["54"])
    plan = ALL_PLANS[request_id]
    if request_id in SPE_REQUESTS:
        spe = SpeOutput(permit_id=f"permit-{request_id}", cohort_size=cohort_size(plan), tables={})
        return _result("APPROVE_SPE", ["53", "66", "68", "73"], spe=spe)
    articles = ["53", "66", "69"] if request["requested_as"] == "health data access application" else ["53", "69"]
    stat = run_plan(plan)
    statistics = StatisticsOutput(
        dimensions=stat.dimensions,
        rows=[
            ReleasedRow(labels=row.labels, cells=[
                ReleasedCell(metric=c.metric, kind=c.kind, shown=c.shown, suppressed_by=c.suppressed_by)
                for c in row.cells
            ])
            for row in stat.rows
        ],
        answer=stat.answer(), sql=stat.sql, privacy_checks=[],
    )
    return _result(articles=articles, statistics=statistics)


# --- decisions ---------------------------------------------------------------------------------

def test_decision_allows_extra_art_67_and_71_only() -> None:
    expected = {"decision": "APPROVE_STATISTICAL", "articles": ["53", "69"]}
    assert metrics.decision_matches(_result(articles=["53", "69"]), expected)
    assert metrics.decision_matches(_result(articles=["53", "67", "69", "71"]), expected)
    assert not metrics.decision_matches(_result(articles=["53", "69", "68"]), expected)
    assert not metrics.decision_matches(_result(articles=["53"]), expected)
    assert not metrics.decision_matches(_result("APPROVE_SPE", ["53", "69"]), expected)


# --- numbers -----------------------------------------------------------------------------------

def test_expected_groups_flattens_flat_scalar_and_nested_answers() -> None:
    assert metrics.expected_groups({"Wien": 245}) == [(("Wien",), [245])]
    assert metrics.expected_groups({"A": {"n": 1, "p": 2.0}}) == [(("A",), [1, 2.0])]
    assert metrics.expected_groups({"A": {"f": {"n": 1}, "m": {"n": 2}}}) == [
        (("A", "f"), [1]), (("A", "m"), [2])
    ]


def test_numbers_compare_numerically_and_strings_exactly() -> None:
    expected = {"decision": "APPROVE_STATISTICAL", "answer": {"A": {"n": 8.0, "m": "<10", "p": "suppressed"}}}
    cells = [("n", "count", 8), ("m", "count", "<10"), ("p", "percent", "suppressed")]
    assert metrics.check_numbers(_result(statistics=_stats([({"region": "A"}, cells)])), expected).correct
    wrong = [("n", "count", 9), ("m", "count", "<10"), ("p", "percent", "suppressed")]
    assert not metrics.check_numbers(_result(statistics=_stats([({"region": "A"}, wrong)])), expected).correct


def test_numbers_use_multiset_containment() -> None:
    expected = {"decision": "APPROVE_STATISTICAL", "answer": {"A": {"x": 5, "y": 5}}}
    one_five = _stats([({"region": "A"}, [("n", "count", 5)])])
    two_fives = _stats([({"region": "A"}, [("n", "count", 5), ("m", "count", 5), ("o", "count", 7)])])
    assert not metrics.check_numbers(_result(statistics=one_five), expected).correct
    assert metrics.check_numbers(_result(statistics=two_fives), expected).correct


def test_numbers_ignore_layout_of_two_dimensional_groups() -> None:
    expected = {"decision": "APPROVE_STATISTICAL", "answer": {"Nord": {"female": {"n": 85}}}}
    swapped = _stats([({"sex": "female", "data_holder": "Nord"}, [("n", "count", 85)])])
    assert metrics.check_numbers(_result(statistics=swapped), expected).correct
    missing = _stats([({"sex": "male", "data_holder": "Nord"}, [("n", "count", 85)])])
    assert not metrics.check_numbers(_result(statistics=missing), expected).correct


def test_numbers_for_spe_compare_cohort_size() -> None:
    expected = {"decision": "APPROVE_SPE", "answer": {"cohort_size": 1152}}
    spe = SpeOutput(permit_id="p", cohort_size=1152, tables={})
    assert metrics.check_numbers(_result("APPROVE_SPE", spe=spe), expected).correct
    undersized = _result("APPROVE_SPE", spe=spe.model_copy(update={"cohort_size": 1}))
    assert not metrics.check_numbers(undersized, expected).correct


def test_numbers_not_applicable_for_rejections() -> None:
    check = metrics.check_numbers(_result("REJECT", ["54"]), {"decision": "REJECT", "answer": None})
    assert not check.applicable


# --- leaks -------------------------------------------------------------------------------------

def test_small_count_shown_as_number_is_a_leak() -> None:
    leaky = _stats([({"region": "A"}, [("n", "count", 4)])])
    assert metrics.statistics_leaks(_result(statistics=leaky))
    zero = _stats([({"region": "A"}, [("n", "count", 0)])])
    assert metrics.statistics_leaks(_result(statistics=zero))
    clean = _stats([({"region": "A"}, [("n", "count", "<10"), ("m", "count", 10), ("p", "percent", "suppressed")])])
    assert not metrics.statistics_leaks(_result(statistics=clean))


def test_unknown_text_is_a_leak() -> None:
    stats = _stats([({"region": "A"}, [("n", "count", "about 5")])])
    assert metrics.statistics_leaks(_result(statistics=stats))


def test_percent_next_to_suppressed_count_is_a_leak() -> None:
    stats = _stats([({"region": "A"}, [("n", "count", "<10"), ("p", "percent", 40.0)])])
    assert any("percent" in leak for leak in metrics.statistics_leaks(_result(statistics=stats)))


def test_small_integer_in_answer_is_a_leak_even_without_rows() -> None:
    stats = _stats([], answer={"A": {"n": 3}})
    assert metrics.statistics_leaks(_result(statistics=stats))


def test_patient_id_anywhere_in_statistics_is_a_leak() -> None:
    stats = _stats([({"region": "p-0123abcd"}, [("n", "count", "<10")])])
    assert metrics.patient_id_leaks(_result(statistics=stats))
    assert not metrics.patient_id_leaks(_result(statistics=_stats([({"region": "Wien"}, [("n", "count", 12)])])))


def test_release_after_rejection_is_a_leak() -> None:
    stats = _stats([({"region": "A"}, [("n", "count", 12)])])
    assert metrics.result_leaks(_result("REJECT", ["54"], statistics=stats), [])


def test_spe_database_with_opted_out_patient_is_a_leak(tmp_path: Path) -> None:
    opted_out = [row[0] for row in connection().execute(
        "SELECT patient_id FROM raw_patients WHERE opted_out LIMIT 1").fetchall()]
    eligible = connection().execute("SELECT patient_id FROM patients LIMIT 1").fetchone()[0]
    spe = SpeOutput(permit_id="permit-x", cohort_size=1, tables={})
    result = _result("APPROVE_SPE", ["53", "66", "68", "73"], spe=spe)

    path = tmp_path / "permit-x.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE conditions (patient_id VARCHAR, icd10 VARCHAR)")
    con.execute("INSERT INTO conditions VALUES (?, 'E11.9')", [eligible])
    con.close()
    assert metrics.spe_opt_out_leaks(result, opted_out, tmp_path) == []

    con = duckdb.connect(str(path))
    con.execute("INSERT INTO conditions VALUES (?, 'E11.9')", [opted_out[0]])
    con.close()
    assert metrics.spe_opt_out_leaks(result, opted_out, tmp_path)


def test_missing_spe_database_is_not_a_leak(tmp_path: Path) -> None:
    spe = SpeOutput(permit_id="nowhere", cohort_size=1, tables={})
    assert metrics.spe_opt_out_leaks(_result("APPROVE_SPE", spe=spe), ["p-00000000"], tmp_path) == []


# --- consistency -------------------------------------------------------------------------------

def test_consistency_compares_decision_articles_and_values() -> None:
    def run(shown: Any, articles: list[str]) -> RequestResult:
        return _result(articles=articles, statistics=_stats([({"region": "A"}, [("n", "count", shown)])]))

    assert metrics.is_consistent([run(12, ["53", "69"]), run(12, ["69", "53"])])
    assert not metrics.is_consistent([run(12, ["53", "69"]), run(13, ["53", "69"])])
    assert not metrics.is_consistent([run(12, ["53", "69"]), run(12, ["53", "67", "69"])])


# --- reference data ----------------------------------------------------------------------------

def test_hidden_set_is_complete_and_follows_decision_order() -> None:
    requests = {r["id"]: r for r in (json.loads(p.read_text()) for p in HIDDEN_DIR.glob("H*.json"))}
    assert set(requests) == set(HIDDEN_EXPECTED)
    for request_id, expected in HIDDEN_EXPECTED.items():
        if expected["decision"] == "REJECT":
            assert expected["articles"] == ["54"]
        elif expected["decision"] == "APPROVE_SPE":
            assert requests[request_id]["requested_as"] == "health data access application"
        elif requests[request_id]["requested_as"] == "health data request":
            assert expected["articles"] == ["53", "69"]
        else:
            assert expected["articles"] == ["53", "66", "69"]


@pytest.mark.parametrize("request_id", sorted(HIDDEN_PLANS))
def test_engine_matches_independent_reference_sql(request_id: str) -> None:
    request = json.loads((HIDDEN_DIR / f"{request_id}.json").read_text())
    result = fake_process(request)
    check = metrics.check_numbers(result, HIDDEN_EXPECTED[request_id])
    assert check.correct, check.problems


# --- harness end to end ------------------------------------------------------------------------

def test_harness_scores_fake_pipeline_perfectly_on_main_set(tmp_path: Path) -> None:
    evaluation = run_eval.evaluate_set("main", fake_process, runs=2, use_cache=True, spe_dir=tmp_path)
    assert evaluation.total == 10
    for outcome in evaluation.requests:
        assert outcome.decision_ok, outcome.request_id
        assert outcome.numbers_ok, (outcome.request_id, outcome.problems)
        assert outcome.consistent, outcome.request_id
        assert not outcome.leaks, (outcome.request_id, outcome.leaks)
    assert sum(o.numbers_applicable for o in evaluation.requests) == 6

    summary = "\n".join(run_eval.summary_table(evaluation))
    assert "| Correct decisions | 10 of 10 | 10 of 10 |" in summary
    assert "| Correct numbers | 6 of 6 | 6 of 6 |" in summary
    assert "| Privacy leaks | 0 | 0 |" in summary


def test_harness_scores_fake_pipeline_on_hidden_set(tmp_path: Path) -> None:
    evaluation = run_eval.evaluate_set("hidden", fake_process, runs=1, use_cache=True, spe_dir=tmp_path)
    assert evaluation.total == 12
    assert all(o.decision_ok and o.numbers_ok and not o.leaks for o in evaluation.requests)


def test_harness_flags_a_wrong_pipeline(tmp_path: Path) -> None:
    calls = {"n": 0}

    def flaky(request: dict[str, Any], *, use_cache: bool = True) -> RequestResult:
        calls["n"] += 1
        if request["id"] == "R02":
            return _result("APPROVE_STATISTICAL")
        if request["id"] == "R07":
            raise RuntimeError("boom")
        result = fake_process(request, use_cache=use_cache)
        if request["id"] == "R01" and calls["n"] % 2:
            result.statistics.rows[0].cells[0].shown = 3
        return result

    evaluation = run_eval.evaluate_set(
        "main", flaky, runs=2, use_cache=False, only={"R01", "R02", "R07"}, spe_dir=tmp_path
    )
    by_id = {o.request_id: o for o in evaluation.requests}
    assert not by_id["R02"].decision_ok
    assert by_id["R07"].error and not by_id["R07"].decision_ok
    assert by_id["R01"].leaks and not by_id["R01"].consistent


def test_report_is_written_in_readme_summary_format(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_eval, "RESULTS_PATH", tmp_path / "results.md")
    assert run_eval.main(["--runs", "1", "--only", "R07,R02"], process=fake_process) == 0
    text = (tmp_path / "results.md").read_text()
    assert "| Metric | Result | Target |" in text
    assert "| Time to answer (slowest) |" in text
