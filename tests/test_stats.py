import json
from decimal import Decimal
from pathlib import Path

import pytest

from backend.stats import LESS_THAN, SUPPRESSED, cohort_size, round_half_up, run_plan
from tests.reference_plans import REFERENCE_PLANS

EXPECTED = json.loads(
    (Path(__file__).resolve().parent.parent / "requests" / "expected.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("request_id", ["R01", "R03", "R07", "R08", "R09"])
def test_reference_plan_matches_expected(request_id: str) -> None:
    answer = run_plan(REFERENCE_PLANS[request_id]).answer()
    for group, expected in EXPECTED[request_id]["answer"].items():
        got = answer[group]
        expected_values = sorted(map(str, expected.values() if isinstance(expected, dict) else [expected]))
        assert sorted(map(str, got.values())) == expected_values, group


def test_spe_cohort_size() -> None:
    assert cohort_size(REFERENCE_PLANS["R05"]) == EXPECTED["R05"]["answer"]["cohort_size"]


def test_round_half_up() -> None:
    assert round_half_up(Decimal("8.25")) == 8.3
    assert round_half_up(Decimal("8.35")) == 8.4
    assert round_half_up(Decimal("0.05")) == 0.1


def test_small_cells_are_never_released() -> None:
    for plan in REFERENCE_PLANS.values():
        for row in run_plan(plan).rows:
            for cell in row.cells:
                if cell.kind == "count" and cell.shown != LESS_THAN:
                    assert cell.shown >= 10
                if cell.kind in ("percent", "mean") and cell.shown != SUPPRESSED:
                    assert all(len(units) >= 10 for units in cell.unit_sets)
