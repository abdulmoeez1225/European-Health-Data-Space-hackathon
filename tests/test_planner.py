import json
from pathlib import Path

import pytest

from backend.planner import canonical_metric_name, with_canonical_names
from tests.reference_plans import REFERENCE_PLANS


@pytest.mark.parametrize("variant", [
    "no_active_oral_anticoagulant",
    "without_active_oral_anticoagulant",
    "have_no_active_oral_anticoagulant",
    "how_many_have_no_active_oral_anticoagulant",
])
def test_wording_variants_share_one_key(variant: str) -> None:
    assert canonical_metric_name(variant) == "no_active_oral_anticoagulant"


def test_names_stay_unique() -> None:
    plan = REFERENCE_PLANS["R01"].model_copy(deep=True)
    plan.metrics[1].name = "count_of_adults"
    names = [m.name for m in with_canonical_names(plan).metrics]
    assert names == ["adults", "adults_2", "prevalence_pct"]


def _definitions(request_id: str) -> list[str]:
    path = Path(__file__).resolve().parent.parent / "requests" / f"{request_id}.json"
    return list(json.loads(path.read_text())["definitions"])


@pytest.mark.parametrize(("request_id", "expected"), [
    ("R01", ["adults", "adults_with_type_2_diabetes", "prevalence_pct"]),
    ("R03", ["patients_with_atrial_fibrillation", "no_active_oral_anticoagulant", "no_active_oral_anticoagulant_pct"]),
    ("R08", ["women_with_bmi", "mean_bmi"]),
    ("R09", ["adults_with_hypertension", "with_active_ace_inhibitor_pct", "with_active_arb_pct"]),
])
def test_names_come_from_the_report_definition(request_id: str, expected: list[str]) -> None:
    plan = REFERENCE_PLANS[request_id]
    assert [m.name for m in with_canonical_names(plan, _definitions(request_id)).metrics] == expected


def test_model_names_used_when_report_does_not_match_metric_count() -> None:
    plan = REFERENCE_PLANS["R07"]
    renamed = with_canonical_names(plan, ["Report per region: inpatient stays and patients."])
    assert [m.name for m in renamed.metrics] == ["inpatient_stays"]
