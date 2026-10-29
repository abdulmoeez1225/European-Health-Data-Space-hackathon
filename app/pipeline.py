"""Process one request end to end: read, decide, compute, protect, record."""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import get_args

from app import audit
from app.db import connection
from app.decide import (
    ASSESSMENT_SYSTEM,
    decide,
    keyword_hits,
    refused_assessment,
    request_text,
    rule_assessment,
)
from app.ledger import applicant_key, apply_ledger
from app.llm import LlmRefused, LlmUnavailable, ask, backend_name
from app.models import (
    PrivacyCheck,
    PurposeAssessment,
    ReleasedCell,
    ReleasedRow,
    RequestResult,
    ReviewFlag,
    StatisticsOutput,
    Timings,
)
from app.plan import DataHolder, QueryPlan, Region
from app.planner import PLAN_SYSTEM, plan_prompt, with_canonical_names
from app.spe import create_spe
from app.stats import LESS_THAN, MIN_CELL, SUPPRESSED, StatResult, run_plan
from app.terminology import map_codes

_PATIENT_ID = re.compile(r"\bp-[0-9a-f]{8}\b|\be\d{6}\b")

_results: dict[str, RequestResult] = {}
_results_lock = threading.Lock()


def request_id(request: dict) -> str:
    if request.get("id"):
        return str(request["id"])
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
                     detail=f"{ledger_blocked} values withheld because, combined with earlier releases to this "
                            "applicant, they would reveal fewer than 10 patients." if ledger_blocked
                     else "No earlier release to this applicant can be combined with these values to reveal a "
                            "small group."),
    ]


def _statistics(result: StatResult, checks: list[PrivacyCheck]) -> StatisticsOutput:
    return StatisticsOutput(
        dimensions=result.dimensions,
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


def _read_request(
    request: dict, use_cache: bool
) -> tuple[PurposeAssessment, QueryPlan | None, bool, bool, list[ReviewFlag]]:
    """Run the purpose assessment and the plan translation in parallel.

    A prohibited purpose needs no plan, so the answer does not wait for it.
    """
    text = request_text(request)
    flags: list[ReviewFlag] = []
    pool = ThreadPoolExecutor(max_workers=2)
    try:
        assessment_job = pool.submit(ask, ASSESSMENT_SYSTEM, text, PurposeAssessment, use_cache=use_cache)
        plan_job = pool.submit(ask, PLAN_SYSTEM, plan_prompt(text), QueryPlan, use_cache=use_cache)
        try:
            assessment, cached_a = assessment_job.result()
            llm_used = True
        except LlmRefused:
            assessment, cached_a, llm_used = refused_assessment(), False, True
            flags.append(ReviewFlag(reason="The AI declined to assess this purpose as potentially harmful; "
                                           "rejected (fail closed) pending staff review."))
        except (LlmUnavailable, ValueError) as error:
            assessment, cached_a, llm_used = rule_assessment(request), False, False
            flags.append(ReviewFlag(reason=f"AI assessment unavailable: {error}"))

        if assessment.prohibited or keyword_hits(request):
            return assessment, None, llm_used, cached_a, flags

        try:
            plan, cached_p = plan_job.result()
            plan = with_canonical_names(plan, request.get("definitions") or [])
        except (LlmUnavailable, ValueError) as error:
            plan, cached_p = None, False
            flags.append(ReviewFlag(reason=f"Could not translate the definitions into a query: {error}"))
        return assessment, plan, llm_used, cached_a and cached_p, flags
    finally:
        pool.shutdown(wait=False)


def process_request(request: dict, *, use_cache: bool = True) -> RequestResult:
    started = time.perf_counter()
    rid = request_id(request)

    assessment, plan, llm_used, cached, flags = _read_request(request, use_cache)
    llm_done = time.perf_counter()
    decision = decide(request, assessment, llm_used=llm_used)
    flags += decision.flags

    statistics = spe = None
    mappings = map_codes(plan) if plan else []
    for mapping in mappings:
        if not mapping.matched:
            flags.append(ReviewFlag(reason=f"{mapping.system} code {mapping.prefix} matches nothing in the data."))

    if decision.code == "APPROVE_STATISTICAL" and plan is not None:
        if not plan.metrics:
            flags.append(ReviewFlag(reason="The request defines no numbers to report; staff must specify the output."))
        else:
            result = run_plan(plan)
            apply_ledger(applicant_key(request), rid, result)
            checks = _privacy_checks(result, plan)
            if all(check.passed for check in checks):
                statistics = _statistics(result, checks)
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
        llm_backend=backend_name() if llm_used else "rules",
        cached=cached,
        timings=Timings(
            llm_s=round(llm_done - started, 2),
            compute_s=round(finished - llm_done, 2),
            total_s=round(finished - started, 2),
        ),
        processed_at=datetime.now(UTC),
    )
    audit.record("decision", "gatekeeper", rid, {
        "decision": outcome.decision, "articles": outcome.articles,
        "applicant": request.get("applicant", {}).get("organisation"), "review_flags": len(flags),
    })
    with _results_lock:
        _results[rid] = outcome
    return outcome


def results() -> list[RequestResult]:
    with _results_lock:
        return sorted(_results.values(), key=lambda r: r.processed_at, reverse=True)


def get_result(rid: str) -> RequestResult | None:
    with _results_lock:
        return _results.get(rid)
