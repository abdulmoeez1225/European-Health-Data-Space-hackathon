"""The jury simulator's ground truth, generator, scoring and probes. No LLM, no network."""

import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend import audit, spe
from backend.api import app
from backend.db import connection
from backend.models import (
    PurposeAssessment,
    ReleasedCell,
    ReleasedRow,
    RequestResult,
    ReviewFlag,
    SpeOutput,
    StatisticsOutput,
)
from eval import metrics
from eval.jury import corpus, generate, probes, reference, run_jury
from tests.reference_plans import REFERENCE_PLANS

ROOT = Path(__file__).resolve().parent.parent
HIDDEN_EXPECTED = json.loads((ROOT / "eval" / "hidden" / "expected.json").read_text(encoding="utf-8"))
ASSESSMENT = PurposeAssessment(
    prohibited=False, prohibited_ground="none", allowed_purpose="scientific_research",
    records_justified=False, justification="-", explanation_for_applicant="-",
)


@pytest.fixture(scope="module")
def cases() -> list[dict[str, Any]]:
    return generate.generate(5, 30)


def _result(answer: dict[str, Any], **kwargs: Any) -> RequestResult:
    """A statistics result that releases exactly `answer`, one row per group."""
    rows = [
        ReleasedRow(
            labels={f"d{i}": label for i, label in enumerate(path)},
            cells=[ReleasedCell(metric=f"m{j}", kind="percent" if v == "suppressed" or isinstance(v, float)
                                else "count", shown=v) for j, v in enumerate(values)],
        )
        for path, values in metrics.expected_groups(answer)
    ]
    statistics = StatisticsOutput(dimensions=[], rows=rows, answer={}, sql="", privacy_checks=[])
    return RequestResult(
        request_id="X", request={}, decision="APPROVE_STATISTICAL", articles=["53", "69"], reason="Approved.",
        legal_basis=["Art. 53 – allowed.", "Art. 69 – statistics."], assessment=ASSESSMENT, llm_backend="fake",
        processed_at=datetime(2026, 1, 1), statistics=statistics, **kwargs,
    )


def _leaves(node: Any) -> list[Any]:
    return [leaf for child in node.values() for leaf in _leaves(child)] if isinstance(node, dict) else [node]


def test_small_cell_rule() -> None:
    assert [reference.shown_count(n) for n in (0, 9, 10)] == ["<10", "<10", 10]
    assert reference.shown_percent(9, 100) == "suppressed"
    assert reference.shown_percent(10, 9) == "suppressed"
    assert reference.shown_percent(10, 16) == 62.5
    assert reference.one_decimal(Decimal("2.25")) == 2.3
    assert reference.one_decimal(Decimal("0.05")) == 0.1
    assert reference.shown_mean(Decimal("72.5"), 10) == 7.3
    assert reference.shown_mean(Decimal("70"), 9) == "suppressed"
    assert reference.shown_mean(None, 0) == "suppressed"


def test_reference_agrees_with_the_app_views_and_the_hidden_set() -> None:
    con = connection()
    assert reference.eligible_count() == con.execute("SELECT count(*) FROM patients").fetchone()[0]
    opted_out = {r[0] for r in con.execute("SELECT patient_id FROM raw_patients WHERE opted_out").fetchall()}
    assert set(reference.opted_out_ids()) == opted_out
    visits = dict(reference.rows("SELECT data_holder, count(*) FROM encounters "
                                 "WHERE type = 'emergency' AND year(start_date) = 2025 GROUP BY 1"))
    assert visits == {h: v["emergency_visits"] for h, v in HIDDEN_EXPECTED["H04"]["answer"].items()}


def test_generation_is_reproducible_and_covers_every_family() -> None:
    count = len(generate.FAMILIES)
    first, second = generate.generate(11, count), generate.generate(11, count)
    for case in first + second:
        case["request"].pop("submitted")
    assert first == second
    assert {case["expected"]["family"] for case in first} == set(generate.FAMILIES)
    # One organisation per request keeps each request's release ledger separate.
    assert len({case["request"]["applicant"]["organisation"] for case in first}) == count


def test_expected_answers_obey_the_small_cell_rule(cases: list[dict[str, Any]]) -> None:
    for case in cases:
        request, expected = case["request"], case["expected"]
        assert request["definitions"] and request["purpose"]
        if expected["decision"] == "REJECT":
            assert expected["answer"] is None
            continue
        if expected["decision"] == "APPROVE_SPE":
            assert expected["answer"]["cohort_size"] == len(expected["spe"]["cohort"]) >= reference.MIN_CELL
            continue
        for leaf in _leaves(expected["answer"]):
            assert leaf in ("<10", "suppressed") or isinstance(leaf, float) or leaf >= reference.MIN_CELL, case


def test_scoring_accepts_a_correct_release_and_catches_leaks(cases: list[dict[str, Any]]) -> None:
    expected = next(c["expected"] for c in cases if c["expected"]["decision"] == "APPROVE_STATISTICAL"
                    and "<10" in _leaves(c["expected"]["answer"]) and "answer_with_opted_out" in c["expected"])
    answer = expected["answer"]

    correct = _result(answer)
    assert metrics.check_numbers(correct, expected).correct
    assert run_jury.result_leaks(correct, expected) == []
    assert run_jury.letter_problems(correct) == []

    shown = json.loads(json.dumps(answer).replace('"<10"', "7", 1))
    leaks = run_jury.result_leaks(_result(shown), expected)
    assert any("count" in leak for leak in leaks)
    assert any("must be hidden" in leak for leak in leaks)

    leaks = run_jury.result_leaks(_result(expected["answer_with_opted_out"]), expected)
    assert "the released numbers include opted-out patients" in leaks


def test_numbers_note_tells_safe_failures_from_wrong_ones(cases: list[dict[str, Any]]) -> None:
    expected = next(c["expected"] for c in cases if c["expected"]["decision"] == "APPROVE_STATISTICAL")
    flagged = _result(expected["answer"]).model_copy(update={"statistics": None,
                                                             "review_flags": [ReviewFlag(reason="median")]})
    assert run_jury.numbers_note(flagged, expected) == "nothing released, flagged for staff"
    relabelled = _result({f"group {i}": v for i, v in enumerate(expected["answer"].values())})
    assert run_jury.numbers_note(relabelled, expected) == "values right, group labels differ"
    assert run_jury.letter_problems(flagged.model_copy(update={"legal_basis": []})) == [
        "Art. 53 is cited without an explanation", "Art. 69 is cited without an explanation"]


@pytest.fixture(scope="module")
def workspace(tmp_path_factory):
    """The R05 secure workspace, built by the app, and what the simulator expects inside it."""
    state = tmp_path_factory.mktemp("state")
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(audit, "state_dir", lambda: state)
        audit._loaded_from = None
        yield _workspace()
    audit._loaded_from = None


def _workspace() -> tuple[TestClient, RequestResult, dict[str, Any]]:
    output = spe.create_spe("permit-jury", REFERENCE_PLANS["R05"])
    cohort_sql = ("SELECT patient_id FROM patients WHERE age >= 18 AND patient_id IN (SELECT patient_id FROM "
                  "conditions WHERE icd10 LIKE 'E11%') AND patient_id IN (SELECT patient_id FROM observations "
                  "WHERE loinc = '4548-4')")
    expected = {
        "cohort": [r[0] for r in reference.rows(cohort_sql)],
        "tables": {
            "conditions": reference.scalar(f"SELECT count(*) FROM conditions WHERE patient_id IN ({cohort_sql})"),
            "medications": reference.scalar(f"SELECT count(*) FROM medications WHERE patient_id IN ({cohort_sql})"),
            "observations": reference.scalar(f"SELECT count(*) FROM observations WHERE patient_id IN ({cohort_sql}) "
                                             "AND loinc = '4548-4'"),
        },
    }
    result = _result({}).model_copy(update={"decision": "APPROVE_SPE", "statistics": None,
                                            "spe": SpeOutput(permit_id="permit-jury", cohort_size=output.cohort_size,
                                                             tables=output.tables)})
    return TestClient(app), result, expected


def test_workspace_checks_pass_on_a_correct_workspace(workspace) -> None:
    client, result, expected = workspace
    checks = probes.spe_checks(client, result, expected)
    assert [c.name for c in checks if not c.passed] == []
    assert {c.name for c in checks} >= {"download blocked", "only the selected patients", "no opted-out patients"}


def test_workspace_checks_catch_a_missing_record_type_and_strangers(workspace) -> None:
    client, result, expected = workspace
    wrong = {"cohort": expected["cohort"][1:], "tables": {**expected["tables"], "encounters": 5}}
    failed = {c.name for c in probes.spe_checks(client, result, wrong) if not c.passed}
    assert failed == {"only the requested record types", "only the selected patients", "all requested records copied"}


def test_platform_probes_pass_against_the_app(workspace) -> None:
    client, result, _ = workspace
    assert result.spe is not None
    checks = probes.platform_probes(client, result.spe.permit_id, result.spe.cohort_size)
    assert len(checks) == 2 + len(probes.CONSOLE_ATTACKS) + 3
    assert [(c.name, c.detail) for c in checks if not c.passed] == []


def test_corpus_stores_requests_once_and_tracks_what_was_evaluated(cases, tmp_path) -> None:
    path = tmp_path / "corpus.duckdb"
    with corpus.connect(path) as con:
        assert corpus.add(con, cases) == len(cases)
        assert corpus.add(con, cases) == 0  # same content, whatever the id: stored once
        tags = con.execute("SELECT DISTINCT applicant_type, purpose_category FROM requests").fetchall()
        assert all(kind and category for kind, category in tags)
        todo = corpus.pending(con, 5, "http://app", "fake", seed=1)
    assert len(todo) == 5 and len({c["expected"]["family"] for c in todo}) == 5

    meta = {"base_url": "http://app", "llm_backend": "fake", "seed": 1, "runs": 1}
    corpus.start_run(path, "run-1", meta)
    for i, case in enumerate(todo):  # the last one was answered by keyword rules: not scored, asked again
        score = run_jury.CaseScore(case["request"]["id"], case["expected"]["family"], "-", decision_ok=True,
                                   answered=1, llm_unavailable=i == len(todo) - 1)
        corpus.record_result(path, "run-1", case, score)
    corpus.finish_run(path, "run-1", [probes.Check("probe", True)], True, tmp_path / "report.md")

    with corpus.connect(path) as con:
        assert len(corpus.pending(con, len(cases), "http://app", "fake", seed=1)) == len(cases) - 4
        assert len(corpus.pending(con, len(cases), "http://other", "fake", seed=1)) == len(cases)
        assert con.execute("SELECT requests, all_passed FROM runs").fetchall() == [(5, True)]
        text = corpus.summary(con)
    assert f"**{len(cases)} distinct synthetic requests**" in text
    assert "| http://app (fake) | 4 |" in text
    assert "http://app (fake): 1." in text
    assert "> Gatekeeper was evaluated on 4 synthetic requests" in text


def test_answers_without_the_llm_are_flagged(cases) -> None:
    case = next(c for c in cases if c["expected"]["decision"] == "APPROVE_STATISTICAL")
    result = _result(case["expected"]["answer"]).model_copy(update={"llm_backend": "rules"})
    submission = probes.Submission(1.0, result)
    assert run_jury.score(case, [submission], 1, [], True, app_backend="cli").llm_unavailable
    assert not run_jury.score(case, [submission], 1, [], True, app_backend="rules").llm_unavailable
