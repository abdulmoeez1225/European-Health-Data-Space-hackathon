import time
from concurrent.futures import ThreadPoolExecutor

from backend.consensus import vote_assessments, vote_plans
from backend.models import PurposeAssessment
from backend.pipeline import _gather
from tests.reference_plans import REFERENCE_PLANS


def _assessment(prohibited: bool, justified: bool = False) -> PurposeAssessment:
    return PurposeAssessment(
        prohibited=prohibited,
        prohibited_ground="advertising_or_marketing" if prohibited else "none",
        allowed_purpose="none" if prohibited else "scientific_research",
        records_justified=justified,
        justification="",
        explanation_for_applicant="",
    )


def test_majority_assessment_wins() -> None:
    vote = vote_assessments([_assessment(False), _assessment(True), _assessment(False)])
    assert (vote.winner.prohibited, vote.agreeing, vote.votes, vote.has_majority) == (False, 2, 3, True)


def test_split_assessment_takes_the_stricter_outcome() -> None:
    vote = vote_assessments([_assessment(False, justified=True), _assessment(True), _assessment(False)])
    assert vote.has_majority is False
    assert vote.winner.prohibited is True


def test_plans_are_compared_by_what_they_release() -> None:
    reference = REFERENCE_PLANS["R01"]
    renamed = reference.model_copy(deep=True)
    renamed.metrics[1].name = "diabetics"
    wrong = reference.model_copy(update={"cohort": []})

    vote = vote_plans([wrong, renamed, reference])

    assert (vote.agreeing, vote.votes) == (2, 3)
    assert vote.winner is renamed


def test_unsupported_reading_loses_to_a_runnable_majority() -> None:
    reference = REFERENCE_PLANS["R07"]
    unsupported = reference.model_copy(update={"unsupported": "median requested"})
    vote = vote_plans([unsupported, reference, reference])
    assert vote.winner is reference


def test_gather_stops_at_quorum_without_waiting_for_a_slow_reading() -> None:
    def reading(value: str, delay: float) -> tuple[str, bool]:
        time.sleep(delay)
        return value, False

    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(reading, "a", 0.0), pool.submit(reading, "a", 0.05), pool.submit(reading, "b", 3.0)]
        started = time.perf_counter()
        readings, errors, _ = _gather(jobs, lambda value: value, time.perf_counter() + 10)
        elapsed = time.perf_counter() - started

    assert readings == ["a", "a"] and errors == []
    assert elapsed < 1.0


def test_gather_respects_the_deadline() -> None:
    def slow() -> tuple[str, bool]:
        time.sleep(2.0)
        return "late", False

    with ThreadPoolExecutor(max_workers=1) as pool:
        readings, errors, _ = _gather([pool.submit(slow)], lambda value: value, time.perf_counter() + 0.2)

    assert readings == [] and isinstance(errors[0], TimeoutError)
