import json

import pytest
from fastapi.testclient import TestClient

from backend import audit, ledger
from backend.api import app
from backend.plan import QueryPlan
from backend.stats import LESS_THAN, SUPPRESSED, run_plan

BURGENLAND = {"kind": "region", "regions": ["Burgenland"]}
ADULT = {"kind": "age", "min_age": 18}
T2D = {"kind": "condition", "icd10_prefixes": ["E11"]}
STROKE = {"kind": "condition", "icd10_prefixes": ["I63", "I64"]}
NO_STROKE = {**STROKE, "negate": True}
GROUP = [{"dimension": "region"}]
METRIC = [{"kind": "count", "name": "adults_with_t2d"}]


def _plan(*extra: dict) -> QueryPlan:
    return QueryPlan.model_validate({
        "cohort": [ADULT, T2D, BURGENLAND, *extra], "group_by": GROUP, "metrics": METRIC,
    })


def _bands_plan(*bands: tuple[str, int, int | None]) -> QueryPlan:
    age_bands = [{"label": label, "min_age": lo, "max_age": hi} for label, lo, hi in bands]
    return QueryPlan.model_validate({
        "cohort": [ADULT, T2D, BURGENLAND], "group_by": [{"dimension": "age_band", "age_bands": age_bands}],
        "metrics": METRIC,
    })


def _stroke_by_sex_plan() -> QueryPlan:
    return QueryPlan.model_validate({
        "cohort": [ADULT], "group_by": [{"dimension": "region"}, {"dimension": "sex"}],
        "metrics": [
            {"kind": "count", "name": "adults"},
            {"kind": "count", "name": "with_stroke", "where": [STROKE]},
            {"kind": "count", "name": "without_stroke", "where": [NO_STROKE]},
        ],
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


def _row(result, **labels: str) -> list:
    return next(row.cells for row in result.rows if row.labels == labels)


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
    assert cell.shown == SUPPRESSED
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


def test_renamed_applicant_cannot_difference_against_another_release() -> None:
    first = run_plan(_plan())
    ledger.apply_ledger("danube institute", "R01", first)
    second = run_plan(_plan(NO_STROKE))
    assert _burgenland(second).exact == "30"

    events = ledger.apply_ledger("renamed research gmbh", "X-1", second)

    cell = _burgenland(second)
    assert cell.shown == SUPPRESSED and "R01" in cell.suppressed_by and "3 patients" in cell.suppressed_by
    assert [(e.applicant_key, e.other_request_id, e.revealed_count) for e in events] == [
        ("renamed research gmbh", "R01", 3)
    ]


def test_identical_release_to_another_applicant_is_repeated() -> None:
    ledger.apply_ledger("applicant one", "R-A", run_plan(_plan()))
    again = run_plan(_plan())

    assert ledger.apply_ledger("applicant two", "R-B", again) == []
    assert _burgenland(again).shown == 33


def test_suppressed_cell_cannot_be_recovered_inside_one_answer() -> None:
    result = run_plan(_stroke_by_sex_plan())
    assert [c.exact for c in _row(result, region="Burgenland", sex="female")] == ["269", "4", "265"]

    events = ledger.apply_ledger("a", "X-2", result)

    adults, with_stroke, without_stroke = _row(result, region="Burgenland", sex="female")
    assert (adults.shown, with_stroke.shown, without_stroke.shown) == (269, LESS_THAN, SUPPRESSED)
    assert without_stroke.suppressed_by == (
        "differencing: combined with other values in this answer this would reveal 4 patients"
    )
    blocked = next(e for e in events if e.labels == {"region": "Burgenland", "sex": "female"})
    assert (blocked.other_request_id, blocked.revealed_count) == ("X-2", 4)
    for row in result.rows:
        adults, with_stroke, without_stroke = row.cells
        if with_stroke.shown == LESS_THAN and with_stroke.exact != "0":
            assert SUPPRESSED in (adults.shown, without_stroke.shown), row.labels


def test_suppressed_answer_is_consistent_across_runs() -> None:
    outputs = []
    for _ in range(3):
        result = run_plan(_stroke_by_sex_plan())
        ledger.apply_ledger("a", "X-2", result)
        outputs.append([(row.labels, [c.shown for c in row.cells]) for row in result.rows])
    assert outputs[0] == outputs[1] == outputs[2]


def test_hidden_band_cannot_be_recovered_from_earlier_total() -> None:
    ledger.apply_ledger("a", "R01", run_plan(_plan()))
    bands = run_plan(_bands_plan(("18-39", 18, 39), ("40-64", 40, 64), ("65+", 65, None)))
    assert [row.cells[0].exact for row in bands.rows] == ["1", "14", "18"]

    events = ledger.apply_ledger("b", "X-3", bands)

    assert [row.cells[0].shown for row in bands.rows] == [LESS_THAN, 14, SUPPRESSED]
    assert [(e.labels, e.other_request_id, e.revealed_count) for e in events] == [({"age_band": "65+"}, "R01", 1)]


def test_total_cannot_be_released_after_its_parts_and_hidden_band() -> None:
    ledger.apply_ledger("b", "X-3", run_plan(_bands_plan(("18-39", 18, 39), ("40-64", 40, 64), ("65+", 65, None))))
    total = run_plan(_plan())

    events = ledger.apply_ledger("a", "R01", total)

    assert _burgenland(total).shown == SUPPRESSED
    assert [e.revealed_count for e in events] == [1]


def test_nested_values_inside_one_answer_follow_the_small_cell_rule() -> None:
    result = run_plan(QueryPlan.model_validate({
        "cohort": [ADULT, T2D, BURGENLAND], "group_by": GROUP,
        "metrics": [{"kind": "count", "name": "t2d"}, {"kind": "count", "name": "t2d_no_stroke", "where": [NO_STROKE]}],
    }))

    assert ledger.apply_ledger("a", "X-4", result) == []
    assert [c.shown for c in _row(result, region="Burgenland")] == [33, 30]


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

    assert len(set(outputs)) == 1 and outputs[0][0] == SUPPRESSED
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


def test_reset_endpoint_is_disabled_unless_allowed(monkeypatch) -> None:
    client = TestClient(app)
    ledger.apply_ledger("a", "R-A", run_plan(_plan()))
    monkeypatch.delenv("GATEKEEPER_ALLOW_LEDGER_RESET", raising=False)

    response = client.post("/api/ledger/reset")

    assert response.status_code == 403
    second = run_plan(_plan({"kind": "age", "min_age": 40}))
    assert len(ledger.apply_ledger("a", "R-B", second)) == 1
    assert not any(e.event == "ledger_reset" for e in audit.events())

    monkeypatch.setenv("GATEKEEPER_ALLOW_LEDGER_RESET", "true")
    assert client.post("/api/ledger/reset").status_code == 200
    assert client.get("/api/ledger").json() == []


def test_applicant_key_normalises_organisation_then_name() -> None:
    request = {"applicant": {"name": "Dr. X", "organisation": "  Danube   Institute "}}
    assert ledger.applicant_key(request) == "danube institute"
    assert ledger.applicant_key({"applicant": {"name": "Dr.  X"}}) == "dr. x"


def test_percent_cell_is_suppressed() -> None:
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
    assert _burgenland(second).shown == SUPPRESSED


def test_ledger_reads_the_per_applicant_format(tmp_path) -> None:
    first = run_plan(_plan())
    units = sorted(_burgenland(first).unit_sets[0])
    (tmp_path / "ledger.json").write_text(json.dumps({
        "released": {"danube institute": {"R01": [{"units": units, "released_at": "2026-10-29T18:30:00+00:00"}]}},
        "events": [],
    }))
    ledger._loaded_from = None

    second = run_plan(_plan({"kind": "age", "min_age": 40}))
    events = ledger.apply_ledger("someone else", "R-B", second)

    assert [(e.other_request_id, e.revealed_count) for e in events] == [("R01", 1)]
