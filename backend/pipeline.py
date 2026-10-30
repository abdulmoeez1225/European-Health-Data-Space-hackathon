"""Process one request end to end: read, decide, compute, protect, record."""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections.abc import Callable, Hashable
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import UTC, datetime
from pathlib import Path
from typing import get_args

from backend import audit
from backend.config import settings
from backend.consensus import release_signature, vote_assessments, vote_plans
from backend.db import connection
from backend.decide import (
    ASSESSMENT_SYSTEM,
    decide,
    refused_assessment,
    request_text,
    rule_assessment,
)
from backend.ledger import applicant_key, apply_ledger
from backend.llm import LlmRefused, LlmUnavailable, ask, backend_name
from backend.models import (
    Appeal,
    Consensus,
    DecisionStatus,
    PrivacyCheck,
    PurposeAssessment,
    ReleasedCell,
    ReleasedRow,
    RequestResult,
    ReviewFlag,
    StaffAction,
    StaffActionKind,
    StatisticsOutput,
    Timings,
)
from backend.plan import DataHolder, QueryPlan, Region
from backend.planner import PLAN_SYSTEM, metric_labels, plan_prompt, report_phrases, with_canonical_names
from backend.spe import create_spe, delete_spe
from backend.stats import LESS_THAN, MIN_CELL, SUPPRESSED, StatResult, run_plan
from backend.terminology import map_codes

_PATIENT_ID = re.compile(r"\bp-[0-9a-f]{8}\b|\be\d{6}\b")
# Ids name files under state/, so they may not contain path separators or dots.
REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")

_results: dict[str, RequestResult] = {}
_results_lock = threading.Lock()
_results_loaded_from: Path | None = None


def request_id(request: dict) -> str:
    if request.get("id"):
        rid = str(request["id"])
        if not REQUEST_ID.fullmatch(rid):
            raise ValueError(f"invalid request id {rid!r}")
        return rid
    digest = hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return f"Q-{digest[:8]}"


def _opted_out_ids() -> frozenset[str]:
    rows = connection().execute("SELECT patient_id FROM raw_patients WHERE opted_out").fetchall()
    return frozenset(r[0] for r in rows)


def _privacy_checks(result: StatResult, plan: QueryPlan) -> list[PrivacyCheck]:
    opted_out = _opted_out_ids()
    cells = [cell for row in result.rows for cell in row.cells]

    leaked_opt_outs = sum(len(units & opted_out) for cell in cells for units in cell.unit_sets)
    small = [
        cell for cell in cells
        if cell.shown not in (LESS_THAN, SUPPRESSED) and any(len(units) < MIN_CELL for units in cell.unit_sets)
    ]
    released_json = json.dumps([[c.shown for c in row.cells] + list(row.labels.values()) for row in result.rows])
    expected_groups = 1
    for group in plan.group_by:
        expected_groups *= len(group.age_bands or []) if group.dimension == "age_band" else {
            "region": len(get_args(Region)), "data_holder": len(get_args(DataHolder)), "sex": 2,
            "encounter_type": 3,
        }.get(group.dimension, len({row.labels[group.dimension] for row in result.rows}))
    ledger_blocked = sum(1 for cell in cells if cell.suppressed_by)

    return [
        PrivacyCheck(name="Opted-out patients excluded (Art. 71)", passed=leaked_opt_outs == 0,
                     detail=f"{len(opted_out)} opted-out patients; {leaked_opt_outs} found in any released value."),
        PrivacyCheck(name="Small-cell rule", passed=not small,
                     detail="Counts under 10 shown as <10; percentages and means over fewer than 10 patients "
                            "suppressed."
                     if not small else f"{len(small)} values computed from fewer than 10 units."),
        PrivacyCheck(name="No patient-level data", passed=not _PATIENT_ID.search(released_json),
                     detail="Only aggregate values and group labels are released."),
        PrivacyCheck(name="Every requested group shown", passed=len(result.rows) == expected_groups,
                     detail=f"{len(result.rows)} of {expected_groups} groups, including empty ones."),
        PrivacyCheck(name="Release ledger (differencing)", passed=True,
                     detail=f"{ledger_blocked} values withheld because, combined with values already released to "
                            "any applicant, they would reveal fewer than 10 patients." if ledger_blocked
                     else "No value already released, to any applicant, can be combined with these values to "
                            "reveal a small group."),
    ]


def _statistics(result: StatResult, checks: list[PrivacyCheck], labels: dict[str, str]) -> StatisticsOutput:
    return StatisticsOutput(
        dimensions=result.dimensions,
        metric_labels=labels,
        rows=[
            ReleasedRow(labels=row.labels, cells=[
                ReleasedCell(metric=c.metric, kind=c.kind, shown=c.shown, suppressed_by=c.suppressed_by)
                for c in row.cells
            ])
            for row in result.rows
        ],
        answer=result.answer(),
        sql=result.sql,
        privacy_checks=checks,
    )


def _gather[T](
    jobs: list[Future[tuple[T, bool]]], key: Callable[[T], Hashable], deadline: float,
) -> tuple[list[T], list[BaseException], bool]:
    """Collect readings until a majority agrees, all are in, or the deadline passes.

    Returns (readings, errors, all_from_cache). Waiting stops at the first majority, so one
    slow reading never holds up the answer.
    """
    quorum = len(jobs) // 2 + 1
    readings: list[T] = []
    errors: list[BaseException] = []
    cached = True
    counts: dict[Hashable, int] = {}
    try:
        for job in as_completed(jobs, timeout=max(deadline - time.perf_counter(), 0.1)):
            try:
                reading, from_cache = job.result()
            except (LlmUnavailable, ValueError) as error:
                errors.append(error)
                continue
            try:
                signature = key(reading)
            except ValueError as error:
                errors.append(error)
                continue
            readings.append(reading)
            cached = cached and from_cache
            counts[signature] = counts.get(signature, 0) + 1
            if counts[signature] >= quorum:
                break
    except FutureTimeout:
        errors.append(TimeoutError("reading did not finish before the deadline"))
    return readings, errors, cached and bool(readings)


def _assessment_signature(assessment: PurposeAssessment) -> tuple[bool, bool]:
    return assessment.prohibited, assessment.records_justified


def _ask_assessment(text: str, use_cache: bool, reading: int) -> tuple[PurposeAssessment, bool]:
    try:
        return ask(ASSESSMENT_SYSTEM, text, PurposeAssessment, use_cache=use_cache, reading=reading)
    except LlmRefused:
        return refused_assessment(), False


_APPROXIMATION = re.compile(r"approximat|overcount|undercount|cannot be expressed|not expressible", re.IGNORECASE)


def _ask_plan(text: str, definitions: list[str], use_cache: bool, reading: int) -> tuple[QueryPlan, bool]:
    plan, cached = ask(PLAN_SYSTEM, plan_prompt(text), QueryPlan, use_cache=use_cache, reading=reading)
    admitted = next((note for note in plan.notes if _APPROXIMATION.search(note)), None)
    if admitted and not plan.unsupported:
        plan = plan.model_copy(update={"unsupported": admitted})
    return with_canonical_names(plan, definitions), cached


def _read_request(
    request: dict, use_cache: bool
) -> tuple[PurposeAssessment, QueryPlan | None, bool, bool, list[ReviewFlag], Consensus]:
    """Independent readings of the purpose and of the definitions, in parallel, decided by majority.

    A prohibited purpose needs no plan, so the answer does not wait for the plans.
    """
    config = settings()
    readings = max(1, config.llm_readings)
    deadline = time.perf_counter() + config.llm_deadline_s
    text = request_text(request)
    definitions = list(request.get("definitions") or [])
    flags: list[ReviewFlag] = []
    consensus = Consensus()

    pool = ThreadPoolExecutor(max_workers=2 * readings)
    try:
        assessment_jobs = [pool.submit(_ask_assessment, text, use_cache, i) for i in range(readings)]
        plan_jobs = [pool.submit(_ask_plan, text, definitions, use_cache, i) for i in range(readings)]

        assessments, errors, cached_a = _gather(assessment_jobs, _assessment_signature, deadline)
        if assessments:
            vote = vote_assessments(assessments)
            assessment, llm_used = vote.winner, True
            consensus.assessment_votes, consensus.assessment_agreeing = vote.votes, vote.agreeing
            if assessment.justification == refused_assessment().justification:
                flags.append(ReviewFlag(reason="The AI declined to assess this purpose as potentially harmful; "
                                               "rejected (fail closed) pending staff review."))
            if not vote.has_majority:
                flags.append(ReviewFlag(reason=f"AI readings of the purpose disagree ({vote.agreeing} of "
                                               f"{vote.votes}); the stricter outcome was applied."))
            elif vote.agreeing < vote.votes:
                flags.append(ReviewFlag(reason=f"Not every AI reading of the purpose agreed ({vote.agreeing} of "
                                               f"{vote.votes}); a borderline purpose for an officer to confirm."))
        else:
            assessment, llm_used, cached_a = rule_assessment(request), False, False
            flags.append(ReviewFlag(reason=f"AI assessment unavailable: {errors[-1] if errors else 'no answer'}"))

        if assessment.prohibited:
            return assessment, None, llm_used, cached_a, flags, consensus

        plans, errors, cached_p = _gather(plan_jobs, release_signature, deadline)
        if not plans:
            flags.append(ReviewFlag(reason="Could not translate the definitions into a query: "
                                           f"{errors[-1] if errors else 'no answer'}"))
            return assessment, None, llm_used, False, flags, consensus
        plan_vote = vote_plans(plans)
        consensus.plan_votes, consensus.plan_agreeing = plan_vote.votes, plan_vote.agreeing
        if not plan_vote.has_majority:
            flags.append(ReviewFlag(reason=f"AI readings of the definitions give different numbers "
                                           f"({plan_vote.agreeing} of {plan_vote.votes} agree); check the plan."))
        return assessment, plan_vote.winner, llm_used, cached_a and cached_p, flags, consensus
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def process_request(request: dict, *, use_cache: bool = True) -> RequestResult:
    started = time.perf_counter()
    rid = request_id(request)

    assessment, plan, llm_used, cached, flags, consensus = _read_request(request, use_cache)
    llm_done = time.perf_counter()
    decision = decide(request, assessment, llm_used=llm_used)
    flags += decision.flags

    statistics = spe = None
    mappings = map_codes(plan) if plan else []
    for mapping in mappings:
        if not mapping.matched:
            flags.append(ReviewFlag(reason=f"{mapping.system} code {mapping.prefix} matches nothing in the data."))

    phrases = report_phrases(list(request.get("definitions") or []))
    if plan is not None and plan.metrics and phrases and len(phrases) != len(plan.metrics):
        flags.append(ReviewFlag(reason=f"The request lists {len(phrases)} numbers to report; the plan computes "
                                       f"{len(plan.metrics)}. Check that nothing is missing."))

    if decision.code == "APPROVE_STATISTICAL" and plan is not None and plan.unsupported:
        flags.append(ReviewFlag(reason=f"Cannot be computed automatically: {plan.unsupported} Staff must prepare "
                                       "this answer."))
    elif decision.code == "APPROVE_STATISTICAL" and plan is not None:
        if not plan.metrics:
            flags.append(ReviewFlag(reason="The request defines no numbers to report; staff must specify the output."))
        else:
            result = run_plan(plan)
            apply_ledger(applicant_key(request), rid, result)
            checks = _privacy_checks(result, plan)
            if all(check.passed for check in checks):
                statistics = _statistics(result, checks, metric_labels(plan, request.get("definitions")))
            else:
                flags.append(ReviewFlag(reason="Privacy firewall blocked the release: "
                                               + "; ".join(c.name for c in checks if not c.passed)))
    elif decision.code == "APPROVE_SPE" and plan is not None:
        if not plan.spe_records:
            flags.append(ReviewFlag(reason="No record types named; the environment holds only the cohort list."))
        spe = create_spe(f"permit-{rid}", plan)

    finished = time.perf_counter()
    outcome = RequestResult(
        request_id=rid,
        request=request,
        decision=decision.code,
        articles=decision.articles,
        reason=decision.reason,
        legal_basis=decision.legal_basis,
        assessment=assessment,
        review_flags=flags,
        plan=plan,
        code_mappings=mappings,
        statistics=statistics,
        spe=spe,
        status="awaiting_permit" if decision.code == "APPROVE_SPE" else "issued",
        llm_backend=backend_name() if llm_used else "rules",
        cached=cached,
        consensus=consensus,
        timings=Timings(
            llm_s=round(llm_done - started, 2),
            compute_s=round(finished - llm_done, 2),
            total_s=round(finished - started, 2),
        ),
        processed_at=datetime.now(UTC),
    )
    audit.record("decision", "gatekeeper", rid, {
        "decision": outcome.decision, "articles": outcome.articles, "status": outcome.status,
        "applicant": request.get("applicant", {}).get("organisation"), "review_flags": len(flags),
    })
    with _results_lock:
        _load_results()
        _store(outcome)
    return outcome


def _results_dir() -> Path:
    path = audit.state_dir() / "results"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _store(result: RequestResult) -> None:
    """Caller holds the lock."""
    _results[result.request_id] = result
    (_results_dir() / f"{result.request_id}.json").write_text(result.model_dump_json())


def _load_results() -> None:
    """Load decisions saved by earlier runs once per state directory. Caller holds the lock."""
    global _results_loaded_from
    directory = _results_dir()
    if _results_loaded_from == directory:
        return
    _results.clear()
    for path in directory.glob("*.json"):
        try:
            loaded = RequestResult.model_validate_json(path.read_text())
        except ValueError:
            continue
        _results[loaded.request_id] = loaded
    _results_loaded_from = directory


def results() -> list[RequestResult]:
    with _results_lock:
        _load_results()
        return sorted(_results.values(), key=lambda r: r.processed_at, reverse=True)


class ActionNotAllowed(ValueError):
    pass


_NEXT_STATUS: dict[StaffActionKind, DecisionStatus] = {
    "permit_issued": "issued", "withdrawn": "withdrawn", "reopened": "reopened",
}


def _check_staff_action(current: RequestResult, kind: StaffActionKind) -> None:
    refused = current.decision == "REJECT"
    if kind == "permit_issued":
        if current.status != "awaiting_permit":
            raise ActionNotAllowed(f"Only a decision awaiting its data permit can be signed off; this one is "
                                   f"{current.status}.")
        return
    allowed = ("issued", "awaiting_permit") if kind == "withdrawn" else ("issued",)
    if current.status not in allowed:
        raise ActionNotAllowed(f"This decision was already {current.status}.")
    if kind == "withdrawn" and refused:
        raise ActionNotAllowed("A refusal releases nothing to withdraw; reopen it for manual review instead.")
    if kind == "reopened" and not refused:
        raise ActionNotAllowed("Only refusals can be reopened; withdraw a grant instead.")


def _apply_staff_action(
    rid: str, kind: StaffActionKind, reason: str,
) -> RequestResult | None:
    with _results_lock:
        _load_results()
        current = _results.get(rid)
        if current is None:
            return None
        _check_staff_action(current, kind)
        # A workspace awaiting its permit was never opened to the applicant, so nothing released is taken back.
        released = kind == "withdrawn" and current.status == "issued" and (
            current.statistics is not None or current.spe is not None
        )
        action = StaffAction(kind=kind, reason=reason.strip(), at=datetime.now(UTC), released_data_withdrawn=released)
        update: dict = {"status": _NEXT_STATUS[kind], "staff_action": action}
        if kind != "permit_issued":
            update |= {"statistics": None, "spe": None}
        updated = current.model_copy(update=update)
        _store(updated)
    if kind != "permit_issued" and current.spe is not None:
        delete_spe(current.spe.permit_id)
    event = "permit_issued" if kind == "permit_issued" else f"decision_{kind}"
    audit.record(event, "staff", rid, {
        "decision": current.decision, "reason": action.reason, "released_data_withdrawn": released,
    })
    return updated


def issue_permit(rid: str, reason: str) -> RequestResult | None:
    """Staff sign off the data permit; the prepared secure workspace opens for the applicant (Art. 68)."""
    return _apply_staff_action(rid, "permit_issued", reason)


def withdraw_decision(rid: str, reason: str) -> RequestResult | None:
    """Take back a grant: released statistics and the secure workspace are pulled."""
    return _apply_staff_action(rid, "withdrawn", reason)


def reopen_decision(rid: str, reason: str) -> RequestResult | None:
    """Set a refusal aside so staff reconsider the case manually."""
    return _apply_staff_action(rid, "reopened", reason)


def appeal_decision(rid: str, reason: str) -> RequestResult | None:
    """The applicant contests a refusal once; staff then decide whether to reopen it."""
    with _results_lock:
        _load_results()
        current = _results.get(rid)
        if current is None:
            return None
        if current.decision != "REJECT" or current.status != "issued":
            raise ActionNotAllowed("Only an issued refusal can be appealed.")
        if current.appeal is not None:
            raise ActionNotAllowed("This refusal was already appealed.")
        appeal = Appeal(reason=reason.strip(), at=datetime.now(UTC))
        updated = current.model_copy(update={"appeal": appeal})
        _store(updated)
    audit.record("appeal_lodged", "applicant", rid, {"decision": current.decision, "reason": appeal.reason})
    return updated


def permit_status(permit_id: str) -> DecisionStatus | None:
    """Status of the decision that prepared this secure workspace, if any."""
    with _results_lock:
        _load_results()
        return next((r.status for r in _results.values() if r.spe and r.spe.permit_id == permit_id), None)


def get_result(rid: str) -> RequestResult | None:
    with _results_lock:
        _load_results()
        return _results.get(rid)
