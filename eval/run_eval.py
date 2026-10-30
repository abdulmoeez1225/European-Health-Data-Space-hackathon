"""Measure the README metrics on the main and hidden request sets.

    .venv/bin/python -m eval.run_eval [--runs 3] [--no-cache] [--set main|hidden|all] [--only R01,R05]
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from backend.models import RequestResult
from eval import metrics

ROOT = Path(__file__).resolve().parent.parent
RESULTS_PATH = Path(__file__).resolve().parent / "results.md"
SETS = {
    "main": (ROOT / "requests", "R*.json", ROOT / "requests" / "expected.json"),
    "hidden": (ROOT / "eval" / "hidden", "H*.json", ROOT / "eval" / "hidden" / "expected.json"),
}

ProcessFn = Callable[..., RequestResult]


@dataclass
class RequestEval:
    request_id: str
    expected: dict[str, Any]
    decision: str = "-"
    articles: list[str] = field(default_factory=list)
    decision_ok: bool = False
    numbers_applicable: bool = False
    numbers_ok: bool = False
    leaks: list[str] = field(default_factory=list)
    consistent: bool = False
    slowest_s: float = 0.0
    problems: list[str] = field(default_factory=list)
    error: str | None = None


@dataclass
class SetEval:
    name: str
    requests: list[RequestEval]

    @property
    def total(self) -> int:
        return len(self.requests)


def load_set(name: str, only: set[str] | None = None) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    directory, pattern, expected_path = SETS[name]
    expected = json.loads(expected_path.read_text()) if expected_path.exists() else {}
    pairs = []
    for path in sorted(directory.glob(pattern)):
        request = json.loads(path.read_text())
        if request["id"] in expected and (only is None or request["id"] in only):
            pairs.append((request, expected[request["id"]]))
    return pairs


def opted_out_patients() -> list[str]:
    from backend.db import connection

    return [row[0] for row in connection().execute("SELECT patient_id FROM raw_patients WHERE opted_out").fetchall()]


def evaluate_request(
    request: dict[str, Any], expected: dict[str, Any], process: ProcessFn, runs: int, use_cache: bool,
    opted_out: list[str], spe_dir: Path = metrics.SPE_DIR,
) -> RequestEval:
    outcome = RequestEval(request["id"], expected)
    results: list[RequestResult] = []
    for _ in range(runs):
        started = time.perf_counter()
        try:
            results.append(process(request, use_cache=use_cache))
        except Exception as exc:  # noqa: BLE001 - a crashing pipeline is a failed request, not a crashed eval
            outcome.error = f"{type(exc).__name__}: {exc}"
        outcome.slowest_s = max(outcome.slowest_s, time.perf_counter() - started)
    if not results:
        return outcome

    last = results[-1]
    outcome.decision, outcome.articles = last.decision, sorted(last.articles)
    outcome.decision_ok = metrics.decision_matches(last, expected)
    numbers = metrics.check_numbers(last, expected)
    outcome.numbers_applicable, outcome.numbers_ok = numbers.applicable, numbers.correct
    outcome.problems = numbers.problems
    outcome.leaks = [leak for r in results for leak in metrics.result_leaks(r, opted_out, spe_dir)]
    outcome.leaks = list(dict.fromkeys(outcome.leaks))
    outcome.consistent = len(results) == runs and metrics.is_consistent(results)
    return outcome


def evaluate_set(
    name: str, process: ProcessFn, runs: int, use_cache: bool, only: set[str] | None = None,
    spe_dir: Path = metrics.SPE_DIR,
) -> SetEval:
    opted_out = opted_out_patients()
    outcomes = [
        evaluate_request(request, expected, process, runs, use_cache, opted_out, spe_dir)
        for request, expected in load_set(name, only)
    ]
    return SetEval(name, outcomes)


def _mark(ok: bool) -> str:
    return "ok" if ok else "FAIL"


def request_table(evaluation: SetEval) -> list[str]:
    lines = [
        "| Request | Decision | Articles | Decision ok | Numbers | Leaks | Consistent | Slowest (s) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in evaluation.requests:
        numbers = _mark(r.numbers_ok) if r.numbers_applicable else "n/a"
        lines.append(
            f"| {r.request_id} | {r.decision} | {', '.join(r.articles) or '-'} | {_mark(r.decision_ok)} | {numbers} "
            f"| {len(r.leaks)} | {_mark(r.consistent)} | {r.slowest_s:.2f} |"
        )
    return lines


def summary_table(evaluation: SetEval) -> list[str]:
    reqs = evaluation.requests
    numeric = [r for r in reqs if r.numbers_applicable]
    slowest = max((r.slowest_s for r in reqs), default=0.0)
    leaks = sum(1 for r in reqs if r.leaks)
    rows = [
        ("Correct decisions", f"{sum(r.decision_ok for r in reqs)} of {len(reqs)}", f"{len(reqs)} of {len(reqs)}"),
        (
            "Correct numbers",
            f"{sum(r.numbers_ok for r in numeric)} of {len(numeric)}",
            f"{len(numeric)} of {len(numeric)}",
        ),
        ("Privacy leaks", str(leaks), "0"),
        ("Consistency", f"{sum(r.consistent for r in reqs)} of {len(reqs)}", f"{len(reqs)} of {len(reqs)}"),
        ("Time to answer (slowest)", f"{slowest:.1f} s", "Under 60 s"),
    ]
    lines = ["| Metric | Result | Target |", "|---|---|---|"]
    lines += [f"| {metric} | {result} | {target} |" for metric, result, target in rows]
    return lines


def details(evaluation: SetEval) -> list[str]:
    lines = []
    for r in evaluation.requests:
        notes = []
        if r.error:
            notes.append(f"error: {r.error}")
        if not r.decision_ok:
            notes.append(f"expected {r.expected['decision']} {r.expected['articles']}, got {r.decision} {r.articles}")
        notes += r.problems
        notes += [f"leak: {leak}" for leak in r.leaks]
        if notes:
            lines.append(f"- {r.request_id}")
            lines += [f"    - {note}" for note in notes]
    return lines


def render(evaluations: list[SetEval], runs: int, use_cache: bool) -> str:
    lines = ["# Evaluation results", "", f"Runs per request: {runs}, cache: {'on' if use_cache else 'off'}", ""]
    for evaluation in evaluations:
        lines += [f"## Set: {evaluation.name} ({evaluation.total} requests)", "", *request_table(evaluation), ""]
        lines += [*summary_table(evaluation), ""]
        problems = details(evaluation)
        if problems:
            lines += ["Problems", "", *problems, ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None, process: ProcessFn | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--set", choices=["main", "hidden", "all"], default="main", dest="request_set")
    parser.add_argument("--only", default="", help="comma-separated request ids")
    args = parser.parse_args(argv)

    spe_dir = metrics.SPE_DIR
    if process is None:
        # Evaluation runs keep their decisions, ledger and workspaces out of the app's own state/,
        # so the demo's decision queue only shows real submissions.
        state = Path(os.environ.setdefault("GATEKEEPER_STATE_DIR", tempfile.mkdtemp(prefix="gatekeeper-eval-")))
        spe_dir = state / "spe"
        try:
            from backend.pipeline import process_request as process
        except ImportError as exc:
            print(f"cannot import backend.pipeline.process_request: {exc}")
            return 0

    only = {part.strip() for part in args.only.split(",") if part.strip()} or None
    names = ["main", "hidden"] if args.request_set == "all" else [args.request_set]
    evaluations = [evaluate_set(name, process, args.runs, not args.no_cache, only, spe_dir) for name in names]
    report = render(evaluations, args.runs, not args.no_cache)
    print(report)
    RESULTS_PATH.write_text(report + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
