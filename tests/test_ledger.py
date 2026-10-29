import pytest

from backend import audit, ledger
from backend.plan import QueryPlan
from backend.stats import LESS_THAN, SUPPRESSED, run_plan

BURGENLAND = {"kind": "region", "regions": ["Burgenland"]}
ADULT = {"kind": "age", "min_age": 18}
T2D = {"kind": "condition", "icd10_prefixes": ["E11"]}
GROUP = [{"dimension": "region"}]
METRIC = [{"kind": "count", "name": "adults_with_t2d"}]


def _plan(*extra: dict) -> QueryPlan:
    return QueryPlan.model_validate({
        "cohort": [ADULT, T2D, BURGENLAND, *extra], "group_by": GROUP, "metrics": METRIC,
    })


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "state_dir", lambda: tmp_path)
    audit._loaded_from = None
    ledger.reset_ledger()
    yield
    ledger.reset_ledger()
    audit._loaded_from = None


def _burgenland(result) -> object:
    return next(row for row in result.rows if row.labels["region"] == "Burgenland").cells[0]


@pytest.fixture(scope="module")
def first_result_exact() -> tuple[str, str]:
    first = _burgenland(run_plan(_plan()))
    second = _burgenland(run_plan(_plan({"kind": "age", "min_age": 40})))
    return first.exact, second.exact


def test_example_numbers_differ_by_one(first_result_exact) -> None:
    assert first_result_exact == ("33", "32")


def test_second_request_is_suppressed(first_result_exact) -> None:
    first, second = run_plan(_plan()), run_plan(_plan({"kind": "age", "min_age": 40}))

    assert ledger.apply_ledger("danube institute", "R-A", first) == []
    assert _burgenland(first).shown == 33

    events = ledger.apply_ledger("danube institute", "R-B", second)

    cell = _burgenland(second)
    assert cell.shown == LESS_THAN
    assert "1 patient" in cell.suppressed_by and "R-A" in cell.suppressed_by
    assert [(e.request_id, e.other_request_id, e.revealed_count, e.labels) for e in events] == [
        ("R-B", "R-A", 1, {"region": "Burgenland"})
    ]
    assert ledger.ledger_events() == events
    assert any(e.event == "ledger_blocked" and e.subject == "R-B" for e in audit.events())


def test_other_cells_in_same_request_are_untouched() -> None:
    first, second = run_plan(_plan()), run_plan(_plan({"kind": "age", "min_age": 40}))
    ledger.apply_ledger("a", "R-A", first)
    ledger.apply_ledger("a", "R-B", second)
    others = [row for row in second.rows if row.labels["region"] != "Burgenland"]
    assert others and all(row.cells[0].suppressed_by is None for row in others)


def test_different_applicant_is_not_suppressed() -> None:
    ledger.apply_ledger("applicant one", "R-A", run_plan(_plan()))
    second = run_plan(_plan({"kind": "age", "min_age": 40}))

    assert ledger.apply_ledger("applicant two", "R-B", second) == []
    assert _burgenland(second).shown == 32


def test_difference_of_ten_or_more_is_safe() -> None:
    ledger.apply_ledger("a", "R-A", run_plan(_plan()))
    second = run_plan(_plan({"kind": "age", "min_age": 60}))
    assert int(_burgenland(second).exact) <= 33 - 10

    assert ledger.apply_ledger("a", "R-B", second) == []


def test_same_request_rerun_is_consistent() -> None:
    ledger.apply_ledger("a", "R-A", run_plan(_plan()))
    outputs = []
    for _ in range(3):
        result = run_plan(_plan({"kind": "age", "min_age": 40}))
        ledger.apply_ledger("a", "R-B", result)
        outputs.append((_burgenland(result).shown, _burgenland(result).suppressed_by))

    assert len(set(outputs)) == 1 and outputs[0][0] == LESS_THAN
    assert len(ledger.ledger_events()) == 1

    rerun_a = run_plan(_plan())
    ledger.apply_ledger("a", "R-A", rerun_a)
    assert _burgenland(rerun_a).shown == 33


def test_reset_clears_history() -> None:
    ledger.apply_ledger("a", "R-A", run_plan(_plan()))
    ledger.reset_ledger()
    second = run_plan(_plan({"kind": "age", "min_age": 40}))

    assert ledger.apply_ledger("a", "R-B", second) == []
    assert ledger.ledger_events() == []
    assert _burgenland(second).shown == 32


def test_applicant_key_normalises_organisation_then_name() -> None:
    request = {"applicant": {"name": "Dr. X", "organisation": "  Danube   Institute "}}
    assert ledger.applicant_key(request) == "danube institute"
    assert ledger.applicant_key({"applicant": {"name": "Dr.  X"}}) == "dr. x"


def test_percent_cell_is_suppressed_not_less_than() -> None:
    def plan(*cohort: dict) -> QueryPlan:
        return QueryPlan.model_validate({
            "cohort": [ADULT, BURGENLAND, *cohort], "group_by": GROUP,
            "metrics": [{"kind": "percent", "name": "t2d_pct", "numerator_where": [T2D]}],
        })

    ledger.apply_ledger("a", "R-A", run_plan(plan()))
    second = run_plan(plan({"kind": "age", "min_age": 40}))
    ledger.apply_ledger("a", "R-B", second)

    cell = _burgenland(second)
    assert cell.exact == "32/360"
    assert cell.shown == SUPPRESSED and "1 patient" in cell.suppressed_by


def test_ledger_survives_a_restart() -> None:
    ledger.apply_ledger("curious analytics gmbh", "RT-1", run_plan(_plan()))
    ledger._loaded_from = None

    second = run_plan(_plan({"kind": "age", "min_age": 40}))
    events = ledger.apply_ledger("curious analytics gmbh", "RT-2", second)

    assert [e.revealed_count for e in events] == [1]
    assert _burgenland(second).shown == LESS_THAN
