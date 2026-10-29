"""Majority vote over independent readings of one request.

A single model reading can misjudge an ambiguous purpose or misplan one definition.
Several readings run in parallel and the outcome most of them agree on is used; staff
see how many agreed. Plans are compared by what they would release (exact values per
group and cohort size), not by their wording.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass

from backend.models import PurposeAssessment
from backend.plan import QueryPlan
from backend.stats import cohort_size, run_plan


@dataclass(frozen=True)
class Vote[T]:
    winner: T
    agreeing: int
    votes: int

    @property
    def has_majority(self) -> bool:
        return self.agreeing * 2 > self.votes


def _assessment_key(assessment: PurposeAssessment) -> tuple[bool, bool]:
    return assessment.prohibited, assessment.records_justified


def vote_assessments(readings: list[PurposeAssessment]) -> Vote[PurposeAssessment]:
    """Most common (prohibited, records justified) pair; a tie goes to the stricter outcome."""
    counts = Counter(_assessment_key(r) for r in readings)
    best = max(counts, key=lambda key: (counts[key], key[0], not key[1]))
    winner = next(r for r in readings if _assessment_key(r) == best)
    return Vote(winner, counts[best], len(readings))


def release_signature(plan: QueryPlan) -> str:
    """What the plan would release: exact values per group, and the cohort size."""
    if plan.unsupported:
        return "unsupported"
    rows = []
    if plan.metrics:
        rows = sorted(
            [sorted(row.labels.items()), [cell.exact for cell in row.cells]] for row in run_plan(plan).rows
        )
    return json.dumps({"cohort": cohort_size(plan), "rows": rows}, sort_keys=True, ensure_ascii=False)


def vote_plans(plans: list[QueryPlan]) -> Vote[QueryPlan]:
    """The plan whose release most readings agree on; plans that fail to compile do not vote."""
    signed: list[tuple[QueryPlan, str]] = []
    for plan in plans:
        try:
            signed.append((plan, release_signature(plan)))
        except ValueError:
            continue
    if not signed:
        raise ValueError("no reading produced a runnable plan")
    counts = Counter(signature for _, signature in signed)
    best = max(counts, key=lambda s: (counts[s], s != "unsupported"))
    winner = next(plan for plan, signature in signed if signature == best)
    return Vote(winner, counts[best], len(plans))
