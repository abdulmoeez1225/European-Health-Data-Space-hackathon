"""Run the stress requests S01-S20 through the real pipeline and score them.

    .venv/bin/python -m eval.stress.run_stress [--runs 2] [--workers 4] [--only S01,S05]

The LLM cache is off. State (ledger, audit log, SPE files) and the LLM cache are redirected to a
scratch directory so a run neither reads nor pollutes the app's own state.
Writes eval/stress/results.json (raw, per run) for FINDINGS.md.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SCRATCH = Path(os.environ.get("STRESS_SCRATCH") or tempfile.mkdtemp(prefix="stress-"))
os.environ["GATEKEEPER_STATE_DIR"] = str(SCRATCH / "state")
os.environ["GATEKEEPER_CACHE_DIR"] = str(SCRATCH / "cache")

from app.models import RequestResult  # noqa: E402
from eval import metrics  # noqa: E402


def load() -> list[tuple[dict, dict]]:
    expected = json.loads((HERE / "expected.json").read_text())
    return [(json.loads(p.read_text()), expected[p.stem]) for p in sorted(HERE.glob("S*.json")) if p.stem in expected]


def is_unsupported(expected: dict) -> bool:
    return str(expected.get("note", "")).startswith("Not expressible")


def labels_only_differ(result: RequestResult, expected: dict) -> bool:
    """True when every expected group's values appear in some released row, whatever its label."""
    pool = list(metrics.released_rows(result).values())
    for _, wanted in metrics.expected_groups(expected["answer"]):
        match = next((row for row in pool if metrics.contains_all(row, wanted)), None)
        if match is None:
            return False
        pool.remove(match)
    return True


def numbers_status(result: RequestResult, expected: dict) -> tuple[str, list[str]]:
    if expected["decision"] == "REJECT":
        return "n/a", []
    if is_unsupported(expected):
        if result.statistics is None:
            return "ok", ["no numbers released (flagged)"]
        return "FAIL", [
            "released numbers for an inexpressible request: "
            + json.dumps(result.statistics.answer, ensure_ascii=False)[:300]
        ]
    if result.statistics is None and any("Cannot be computed" in f.reason for f in result.review_flags):
        return "FLAGGED", ["not computable with the DSL; flagged for staff, no numbers released"]
    check = metrics.check_numbers(result, expected)
    problems = list(check.problems)
    if check.correct:
        return "ok", problems
    is_table = "cohort_size" not in expected["answer"]
    if is_table and result.statistics is not None and labels_only_differ(result, expected):
        problems.append("LABELS ONLY: values are right, group labels differ")
    return "FAIL", problems


def summarise(result: RequestResult | None, error: str | None, seconds: float) -> dict[str, Any]:
    if result is None:
        return {"error": error, "seconds": round(seconds, 1)}
    plan = result.plan.model_dump(mode="json") if result.plan else None
    return {
        "decision": result.decision,
        "articles": sorted(result.articles),
        "assessment": result.assessment.model_dump(mode="json"),
        "review_flags": [f.reason for f in result.review_flags],
        "plan": plan,
        "answer": result.statistics.answer if result.statistics else None,
        "sql": result.statistics.sql if result.statistics else None,
        "spe": result.spe.model_dump(mode="json") if result.spe else None,
        "consensus": result.consensus.model_dump(mode="json") if hasattr(result, "consensus") else None,
        "seconds": round(seconds, 1),
        "signature": metrics.signature(result),
    }


def run_one(request: dict) -> tuple[RequestResult | None, str | None, float]:
    from app.pipeline import process_request

    started = time.perf_counter()
    try:
        return process_request(request, use_cache=False), None, time.perf_counter() - started
    except Exception as exc:  # noqa: BLE001 - a crashing pipeline is a failed request
        return None, f"{type(exc).__name__}: {exc}", time.perf_counter() - started


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--only", default="")
    parser.add_argument("--out", default=str(HERE / "results.json"))
    args = parser.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    pairs = [(r, e) for r, e in load() if not only or r["id"] in only]

    from eval.run_eval import opted_out_patients

    opted_out = opted_out_patients()
    spe_dir = SCRATCH / "state" / "spe"
    runs: dict[str, list[tuple[RequestResult | None, str | None, float]]] = {r["id"]: [] for r, _ in pairs}
    # One pass per run index, so the same request never runs concurrently with itself (same SPE permit).
    for index in range(args.runs):
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            outcomes = list(pool.map(lambda pair: run_one(pair[0]), pairs))
        for (request, _), outcome in zip(pairs, outcomes, strict=True):
            runs[request["id"]].append(outcome)
        print(f"run {index + 1}/{args.runs} done", flush=True)

    report: dict[str, Any] = {}
    for request, expected in pairs:
        rid = request["id"]
        outcomes = runs[rid]
        results = [r for r, _, _ in outcomes if r is not None]
        entry: dict[str, Any] = {
            "expected": {"decision": expected["decision"], "articles": expected["articles"]},
            "runs": [summarise(*o) for o in outcomes],
        }
        if results:
            last = results[-1]
            entry["decision_ok"] = [metrics.decision_matches(r, expected) for r in results]
            statuses = [numbers_status(r, expected) for r in results]
            entry["numbers"] = [s for s, _ in statuses]
            entry["problems"] = [p for _, ps in statuses for p in ps]
            leaks = [leak for r in results for leak in metrics.result_leaks(r, opted_out, spe_dir)]
            entry["leaks"] = list(dict.fromkeys(leaks))
            entry["consistent"] = len(results) == len(outcomes) and metrics.is_consistent(results)
            if expected["decision"] == "APPROVE_SPE" and last.spe is not None:
                entry["spe_tables"] = last.spe.tables
                entry["spe_tables_expected"] = expected.get("spe_rows")
        else:
            entry.update(decision_ok=[], numbers=[], problems=[], leaks=[], consistent=False)
        report[rid] = entry

    out = Path(args.out)
    if only and out.exists():
        report = {**json.loads(out.read_text()), **report}
    out.write_text(json.dumps(report, indent=1, ensure_ascii=False, default=str) + "\n")
    for rid, e in report.items():
        print(
            rid,
            "dec",
            e["decision_ok"],
            "num",
            e["numbers"],
            "leaks",
            len(e["leaks"]),
            "cons",
            e["consistent"],
            [r.get("decision") or r.get("error") for r in e["runs"]],
            [r["seconds"] for r in e["runs"]],
        )


if __name__ == "__main__":
    main()
