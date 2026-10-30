import json
import re
from pathlib import Path

import pytest

from backend.plan import QueryPlan
from backend.planner import canonical_metric_name, metric_labels, with_canonical_names
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


def test_german_report_line_gives_clean_names() -> None:
    plan = REFERENCE_PLANS["R01"]
    definitions = [
        "Bericht pro Bundesland: Erwachsene, Erwachsene mit Typ-2-Diabetes und die Prävalenz, eine Nachkommastelle."
    ]
    names = [m.name for m in with_canonical_names(plan, definitions).metrics]
    assert names == ["erwachsene", "erwachsene_mit_typ_2_diabetes", "praevalenz_pct"]


def test_headings_keep_the_applicants_spelling() -> None:
    plan = REFERENCE_PLANS["R03"]
    definitions = [
        "Bericht pro Altersgruppe: Patientinnen und Patienten mit Vorhofflimmern, wie viele davon kein aktives "
        "orales Antikoagulans haben und dieser Anteil in %, eine Nachkommastelle."
    ]
    labels = metric_labels(with_canonical_names(plan, definitions), definitions)
    assert list(labels.values()) == ["Patienten mit Vorhofflimmern", "Kein aktives orales Antikoagulans",
                                     "Kein aktives orales Antikoagulans (%)"]


def test_german_gendered_pair_and_back_reference() -> None:
    plan = REFERENCE_PLANS["R03"]
    definitions = [
        "Bericht pro Altersgruppe: Patientinnen und Patienten mit Vorhofflimmern, wie viele davon kein aktives "
        "orales Antikoagulans haben und dieser Anteil in %, eine Nachkommastelle."
    ]
    names = [m.name for m in with_canonical_names(plan, definitions).metrics]
    assert names == ["patienten_mit_vorhofflimmern", "kein_aktives_orales_antikoagulans",
                     "kein_aktives_orales_antikoagulans_pct"]


_LONG = "adults with hypertension whose latest systolic blood pressure in 2025 is 140 mmHg or higher"
_VALID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def _report_names(request_id: str, report: str) -> list[str]:
    return [m.name for m in with_canonical_names(REFERENCE_PLANS[request_id], [report]).metrics]


def test_long_report_phrase_gives_a_valid_name() -> None:
    plan = with_canonical_names(REFERENCE_PLANS["R08"], [f"Report per region: {_LONG} and mean BMI."])
    QueryPlan.model_validate(plan.model_dump())
    assert plan.metrics[1].name == "mean_bmi"


def test_long_percentage_keeps_its_suffix() -> None:
    names = _report_names("R03", f"Report per band: patients with atrial fibrillation, no active oral anticoagulant "
                                 f"and percentage of {_LONG} in the band.")
    assert names[2].endswith("_pct") and _VALID.match(names[2])


def test_long_phrases_cut_to_the_same_stem_stay_distinct() -> None:
    names = _report_names("R08", f"Report per region: {_LONG} among women, {_LONG} among men.")
    assert names[0] != names[1] and all(_VALID.match(n) for n in names)


def test_short_names_are_unchanged() -> None:
    assert _report_names("R08", "Report per region: women with BMI and mean BMI.") == ["women_with_bmi", "mean_bmi"]
