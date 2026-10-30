"""Jury simulator: new requests, submitted over HTTP, scored the way the jury scores them.

Draws fresh jury-style requests (eval/jury/generate.py), submits each one --runs times to a running
Gatekeeper through its public API, and scores the brief's five metrics against answers computed
independently (eval/jury/reference.py). It also checks every secure workspace from the outside,
attacks the workspace console and airlock, runs a differencing attack against the release ledger
and checks that each decision letter explains every article it cites.

    .venv/bin/python -m eval.jury.run_jury                        # app on http://localhost:8000
    .venv/bin/python -m eval.jury.run_jury --count 10 --runs 1    # quicker
    .venv/bin/python -m eval.jury.run_jury --seed 7               # repeat an earlier set
    .venv/bin/python -m eval.jury.run_jury --live                 # the deployed site (asks first)
    .venv/bin/python -m eval.jury.run_jury --from-corpus 200      # stored requests not yet evaluated here

The app stores every request: they appear in its decision queue, release ledger and audit log, with
ids starting JS-<seed>. Each run of a request uses another applicant name, so the app's LLM cache
cannot answer it and the consistency metric measures fresh readings. Every request and result is
also recorded in the corpus (eval/jury/corpus.py) unless --no-corpus is given.
"""

from __future__ import annotations

import argparse
import copy
import functools
import json
import re
import secrets
import sys
import threading
from collections import Counter
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from backend.models import RequestResult
from eval import metrics
from eval.jury import corpus, generate, probes
from eval.jury.reference import eligible_count

HERE = Path(__file__).resolve().parent
LIVE_URL = "https://85.217.173.14.sslip.io"
LOCAL_URL = "http://localhost:8000"
TIME_LIMIT_S = 60.0


@dataclass
class CaseScore:
    request_id: str
    family: str
    expected: str
    decision: str = "-"
    articles: list[str] = field(default_factory=list)
    decision_ok: bool = False
    numbers_applicable: bool = False
    numbers_ok: bool = False
    numbers_note: str = ""
    leaks: list[str] = field(default_factory=list)
    consistent: bool = False
    slowest_s: float = 0.0
    answered: int = 0
    llm_unavailable: bool = False
    cached_runs: int = 0
    letter_problems: list[str] = field(default_factory=list)
    spe_checks: list[probes.Check] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def with_run_applicant(request: dict[str, Any], run: int) -> dict[str, Any]:
    """The same request from another person of the same organisation, which the LLM cache has not seen."""
    varied = copy.deepcopy(request)
    names = generate.NAMES
    current = varied["applicant"]["name"]
    start = names.index(current) if current in names else 0
    varied["applicant"]["name"] = names[(start + run) % len(names)]
    return varied


def hidden_value_leaks(result: RequestResult, answer: Any) -> list[str]:
    """Groups that show a number where the true value is below 10 (or a percentage/mean that must be hidden)."""
    if not isinstance(answer, dict) or "cohort_size" in answer:
        return []
    released = metrics.released_rows(result)
    leaks = []
    for path, wanted in metrics.expected_groups(answer):
        got = released.get(tuple(sorted(path)))
        if got is None or len(got) < len(wanted):
            continue  # a missing group or metric is a numbers problem, not a leak
        need = sum(1 for v in wanted if v in metrics.SMALL_CELL_TEXT)
        hidden = sum(1 for v in got if v in metrics.SMALL_CELL_TEXT)
        if hidden < need:
            leaks.append(f"{'/'.join(path)}: {need - hidden} value(s) that must be hidden are shown ({got})")
    return leaks


def result_leaks(result: RequestResult, expected: dict[str, Any]) -> list[str]:
    leaks = metrics.patient_id_leaks(result)
    if result.decision == "APPROVE_STATISTICAL":
        leaks += metrics.statistics_leaks(result) + hidden_value_leaks(result, expected.get("answer"))
    elif result.decision == "REJECT" and (result.statistics or result.spe):
        leaks.append("data released for a rejected request")
    with_opted_out = expected.get("answer_with_opted_out")
    if (with_opted_out and not metrics.check_numbers(result, expected).correct
            and metrics.check_numbers(result, {**expected, "answer": with_opted_out}).correct):
        leaks.append("the released numbers include opted-out patients")
    return leaks


def numbers_note(result: RequestResult, expected: dict[str, Any]) -> str:
    answer = expected["answer"]
    if "cohort_size" in answer:
        got = result.spe.cohort_size if result.spe else None
        return f"cohort {got} instead of {answer['cohort_size']}" if got is not None else "no secure workspace"
    if result.statistics is None:
        return "nothing released, flagged for staff" if result.review_flags else "nothing released"
    pools = list(metrics.released_rows(result).values())
    if pools and all(any(metrics.contains_all(pool, wanted) for pool in pools)
                     for _, wanted in metrics.expected_groups(answer)):
        return "values right, group labels differ"
    return "wrong values released"


def letter_problems(result: RequestResult) -> list[str]:
    problems = [] if result.reason.strip() else ["no plain-language reason for the applicant"]
    for article in result.articles:
        if not any(re.match(rf"Art\.?\s*{article}\b", line) for line in result.legal_basis):
            problems.append(f"Art. {article} is cited without an explanation")
    return problems


def score(case: dict[str, Any], submissions: Sequence[probes.Submission], runs: int,
          spe_checks: list[probes.Check], staff_view_ok: bool, app_backend: str = "") -> CaseScore:
    request, expected = case["request"], case["expected"]
    outcome = CaseScore(request["id"], expected["family"], f"{expected['decision']} {', '.join(expected['articles'])}")
    outcome.slowest_s = max((s.seconds for s in submissions), default=0.0)
    outcome.errors = list(dict.fromkeys(s.error for s in submissions if s.error))
    results = [s.result for s in submissions if s.result is not None]
    outcome.answered = len(results)
    # An app with an LLM that answers by keyword rules lost its provider (down, rate limit, quota).
    fallbacks = sum(r.llm_backend == "rules" for r in results) if app_backend not in ("", "rules") else 0
    if fallbacks:
        outcome.llm_unavailable = True
        outcome.errors.append(f"the app's LLM did not answer in {fallbacks} of {len(results)} runs; it fell back to "
                              "keyword rules")
    if not results:
        return outcome
    last = results[-1]
    outcome.decision, outcome.articles = last.decision, sorted(last.articles)
    outcome.decision_ok = metrics.decision_matches(last, expected)
    numbers = metrics.check_numbers(last, expected)
    outcome.numbers_applicable, outcome.numbers_ok = numbers.applicable, numbers.correct
    if numbers.applicable and not numbers.correct:
        outcome.numbers_note = numbers_note(last, expected)
        outcome.problems = numbers.problems[:6]
    outcome.leaks = list(dict.fromkeys(leak for r in results for leak in result_leaks(r, expected)))
    outcome.consistent = len(results) == runs and metrics.is_consistent(results)
    outcome.cached_runs = sum(r.cached for r in results)
    outcome.letter_problems = letter_problems(last) + ([] if staff_view_ok else ["decision missing from staff view"])
    outcome.spe_checks = spe_checks
    outcome.flags = [flag.reason for flag in last.review_flags]
    return outcome


class Runner:
    def __init__(self, client: httpx.Client, runs: int, total: int, app_backend: str = "",
                 record: Callable[[dict[str, Any], CaseScore], None] | None = None) -> None:
        self.client, self.runs, self.total = client, runs, total
        self.app_backend, self.record = app_backend, record
        self.done = 0
        self.lock = threading.Lock()
        self.raw: dict[str, list[dict[str, Any]]] = {}
        self.permits: list[tuple[str, int]] = []

    def run_case(self, case: dict[str, Any]) -> CaseScore:
        request, expected = case["request"], case["expected"]
        submissions = []
        for run in range(self.runs):
            submission = probes.submit(self.client, with_run_applicant(request, run))
            submissions.append(submission)
            self._progress(request["id"], run, submission, expected)
        last = next((s.result for s in reversed(submissions) if s.result is not None), None)
        spe_checks: list[probes.Check] = []
        staff_view_ok = False
        if last is not None:
            staff = self.client.get(f"/api/requests/{last.request_id}")
            staff_view_ok = staff.status_code == 200 and staff.json().get("decision") == last.decision
            if last.spe is not None and "spe" in expected:
                spe_checks = probes.spe_checks(self.client, last, expected["spe"])
                with self.lock:
                    self.permits.append((last.spe.permit_id, last.spe.cohort_size))
        with self.lock:
            self.raw[request["id"]] = [
                {"seconds": round(s.seconds, 2), "error": s.error,
                 "result": s.result.model_dump(mode="json", exclude={"request"}) if s.result else None}
                for s in submissions
            ]
        outcome = score(case, submissions, self.runs, spe_checks, staff_view_ok, self.app_backend)
        if self.record is not None:
            with self.lock:
                self.record(case, outcome)
        return outcome

    def _progress(self, request_id: str, run: int, submission: probes.Submission, expected: dict[str, Any]) -> None:
        with self.lock:
            self.done += 1
            if submission.result is None:
                status = f"ERROR {submission.error}"
            else:
                result = submission.result
                ok = "ok" if metrics.decision_matches(result, expected) else f"expected {expected['decision']}"
                status = f"{result.decision} {','.join(result.articles)} ({ok})"
            print(f"[{self.done:3d}/{self.total}] {request_id} run {run + 1}/{self.runs} "
                  f"{submission.seconds:5.1f}s  {status}", flush=True)


# --- report -----------------------------------------------------------------------------------


def _mark(ok: bool) -> str:
    return "ok" if ok else "FAIL"


def _of(passed: int, total: int) -> str:
    return f"{passed} of {total}"


def scorecard(scores: Sequence[CaseScore], runs: int) -> tuple[list[tuple[str, str, str, bool]], bool]:
    numeric = [s for s in scores if s.numbers_applicable]
    leaking = sum(1 for s in scores if s.leaks)
    slowest = max((s.slowest_s for s in scores), default=0.0)
    rows = [
        ("Correct decisions", _of(sum(s.decision_ok for s in scores), len(scores)), _of(len(scores), len(scores)),
         all(s.decision_ok for s in scores)),
        ("Correct numbers", _of(sum(s.numbers_ok for s in numeric), len(numeric)), _of(len(numeric), len(numeric)),
         all(s.numbers_ok for s in numeric)),
        ("Privacy leaks", str(leaking), "0", leaking == 0),
        ("Consistency" + ("" if runs > 1 else " (needs --runs 2+)"), _of(sum(s.consistent for s in scores),
                                                                         len(scores)),
         _of(len(scores), len(scores)), runs < 2 or all(s.consistent for s in scores)),
        ("Time to answer (slowest)", f"{slowest:.1f} s", f"Under {TIME_LIMIT_S:.0f} s", slowest < TIME_LIMIT_S),
    ]
    return rows, all(row[3] for row in rows)


def render(scores: Sequence[CaseScore], platform: Sequence[probes.Check], meta: dict[str, Any],
           out: Path) -> tuple[str, bool]:
    runs = meta["runs"]
    rows, metrics_ok = scorecard(scores, runs)
    with_spe = [s for s in scores if s.spe_checks]
    spe_ok = sum(all(c.passed for c in s.spe_checks) for s in with_spe)
    answered = [s for s in scores if s.decision != "-"]
    letters_ok = sum(not s.letter_problems for s in answered)
    ran = [c for c in platform if c.passed is not None]
    probes_ok = sum(bool(c.passed) for c in ran)
    errors = sum(len(s.errors) for s in scores)
    cached = sum(s.cached_runs for s in scores)

    lines = [
        "# Jury simulator", "",
        f"Target {meta['base_url']} (LLM backend: {meta['llm_backend']}) · seed {meta['seed']} · "
        f"{len(scores)} {meta.get('source', 'new requests')} × {runs} runs · {meta['started']}", "",
        "## The brief's metrics on new requests", "",
        "| Metric | Result | Target | |", "|---|---|---|---|",
        *[f"| {name} | {result} | {target} | {_mark(ok)} |" for name, result, target, ok in rows], "",
        "## Beyond the metrics", "",
        "| Check | Result |", "|---|---|",
        f"| Secure workspaces correct from outside (download blocked, exact patients, no opt-outs, record types) "
        f"| {_of(spe_ok, len(with_spe))} |",
        f"| Decision letters with a reason and an explanation for every cited article, visible to staff "
        f"| {_of(letters_ok, len(answered))} |",
        f"| Platform probes (attacks on the workspace and airlock, differencing attack, bad input) "
        f"| {_of(probes_ok, len(ran))} |",
        f"| Requests that failed (HTTP error, timeout, bad response) | {errors} |",
        f"| Answers served from the app's LLM cache | {cached} |",
        "",
        "## By family", "",
        "| Family | Requests | Decisions | Numbers | Leaks | Consistent |", "|---|---|---|---|---|---|",
    ]
    for family in generate.FAMILIES:
        group = [s for s in scores if s.family == family]
        if not group:
            continue
        numeric = [s for s in group if s.numbers_applicable]
        lines.append(f"| {family} | {len(group)} | {_of(sum(s.decision_ok for s in group), len(group))} | "
                     f"{_of(sum(s.numbers_ok for s in numeric), len(numeric)) if numeric else 'n/a'} | "
                     f"{sum(1 for s in group if s.leaks)} | {_of(sum(s.consistent for s in group), len(group))} |")
    lines += [
        "", "## Per request", "",
        "| Request | Family | Expected | Got | Decision | Numbers | Leaks | Consistent | Slowest (s) |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for s in scores:
        numbers = _mark(s.numbers_ok) if s.numbers_applicable else "n/a"
        lines.append(f"| {s.request_id} | {s.family} | {s.expected} | {s.decision} {', '.join(s.articles)} | "
                     f"{_mark(s.decision_ok)} | {numbers} | {len(s.leaks)} | {_mark(s.consistent)} | "
                     f"{s.slowest_s:.1f} |")

    problems = []
    for s in scores:
        notes = [f"error: {e}" for e in s.errors]
        if s.decision != "-" and not s.decision_ok:
            notes.append(f"expected {s.expected}, got {s.decision} {', '.join(s.articles)}")
        if s.numbers_note:
            notes.append(f"numbers: {s.numbers_note}")
        notes += [f"  {p}" for p in s.problems]
        notes += [f"LEAK: {leak}" for leak in s.leaks]
        if s.decision != "-" and not s.consistent and runs > 1:
            notes.append("runs disagree (see results.json)")
        notes += [f"letter: {p}" for p in s.letter_problems]
        notes += [f"workspace: {c.name} FAILED {c.detail}" for c in s.spe_checks if not c.passed]
        if s.slowest_s >= TIME_LIMIT_S:
            notes.append(f"slow: {s.slowest_s:.1f} s")
        if notes:
            notes += [f"review flag: {f}" for f in s.flags]
            path = out / "requests" / f"{s.request_id}.json"
            problems.append(f"- **{s.request_id}** ({s.family}), request: `{path}`")
            problems += [f"    - {n}" for n in notes]
    if problems:
        lines += ["", "## Problems", "", *problems]

    if platform:
        lines += ["", "## Platform probes", "", "| Probe | Result | Detail |", "|---|---|---|"]
        for check in platform:
            result = "skipped" if check.passed is None else _mark(check.passed)
            lines.append(f"| {check.name} | {result} | {check.detail.replace('|', '/')} |")

    all_ok = (metrics_ok and spe_ok == len(with_spe) and letters_ok == len(answered) and probes_ok == len(ran)
              and errors == 0)
    lines += ["", f"**Overall: {'ready for the jury' if all_ok else 'problems found, see above'}.**", ""]
    return "\n".join(lines), all_ok


# --- main -------------------------------------------------------------------------------------


def confirm_live(count: int, runs: int) -> bool:
    if not sys.stdin.isatty():
        print("--live sends requests to the deployed site; add --yes to confirm.")
        return False
    answer = input(f"This sends about {count * runs + 2} requests to {LIVE_URL}. They stay in its decision queue, "
                   "release ledger and audit log, and use its LLM quota. Continue? [y/N] ")
    return answer.strip().lower() in ("y", "yes")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default=LOCAL_URL, help=f"running app (default {LOCAL_URL})")
    parser.add_argument("--live", action="store_true", help=f"test the deployed site, {LIVE_URL}")
    parser.add_argument("--yes", action="store_true", help="do not ask before testing the live site")
    parser.add_argument("--seed", type=int, default=None, help="repeat an earlier set (default: a new random set)")
    parser.add_argument("--count", type=int, default=20, help="number of new requests (default 20)")
    parser.add_argument("--from-corpus", type=int, default=0, metavar="N",
                        help="evaluate N stored requests not yet evaluated on this app and backend instead")
    parser.add_argument("--runs", type=int, default=3, help="submissions per request, for consistency (default 3)")
    parser.add_argument("--families", default="", help=f"comma-separated subset of: {', '.join(generate.FAMILIES)}")
    parser.add_argument("--workers", type=int, default=1, help="requests processed in parallel (default 1)")
    parser.add_argument("--timeout", type=float, default=300.0, help="seconds to wait for one answer")
    parser.add_argument("--no-probes", action="store_true", help="skip the attacks on workspaces and the ledger")
    parser.add_argument("--generate-only", action="store_true", help="write the requests and answers, submit nothing")
    parser.add_argument("--out", type=Path, default=None, help="folder for requests, answers and the report")
    parser.add_argument("--corpus", type=Path, default=corpus.CORPUS_PATH, help="corpus database to record into")
    parser.add_argument("--no-corpus", action="store_true", help="do not record this run in the corpus")
    args = parser.parse_args(argv)
    if args.from_corpus and args.no_corpus:
        parser.error("--from-corpus reads the corpus; drop --no-corpus")

    seed = args.seed if args.seed is not None else secrets.randbelow(1_000_000)
    base_url = LIVE_URL if args.live else args.base_url.rstrip("/")
    started = datetime.now()
    run_id = f"{started:%Y%m%d-%H%M%S}-seed{seed}"
    out = args.out or HERE / "runs" / run_id
    families = [f for f in args.families.split(",") if f] or None
    recording = not args.no_corpus

    cases: list[dict[str, Any]] = []
    if not args.from_corpus:
        print(f"Drawing {args.count} new requests (seed {seed}) and computing their answers ...", flush=True)
        cases = generate.generate(seed, args.count, families)
        generate.write(cases, out)
        print(f"Requests and expected answers: {out}")
        if args.generate_only:
            if recording:
                with corpus.connect(args.corpus) as store:
                    print(f"{corpus.add(store, cases)} of them are new to the corpus ({args.corpus})")
            return 0
    if args.live and not args.yes and not confirm_live(args.from_corpus or len(cases), args.runs):
        return 2

    with httpx.Client(base_url=base_url, timeout=args.timeout) as client:
        try:
            health = client.get("/api/health").json()
        except (httpx.HTTPError, ValueError) as exc:
            print(f"Cannot reach {base_url}/api/health ({exc}). Start the app with `make run` or pass --base-url.")
            return 2
        eligible = health["patients"]["eligible"]
        if eligible != eligible_count():
            print(f"The app serves {eligible} eligible patients, data/ has {eligible_count()}: the expected answers "
                  "would not apply. Point it at the same data.")
            return 2
        print(f"{base_url}: LLM backend {health['llm_backend']}, {eligible} eligible patients", flush=True)
        if args.from_corpus:
            with corpus.connect(args.corpus) as store:
                cases = corpus.pending(store, args.from_corpus, base_url, health["llm_backend"], seed, families)
            if not cases:
                print("Every stored request has been evaluated on this app and backend. Add more with "
                      "`python -m eval.jury.corpus build`.")
                return 0
            generate.write(cases, out)
            print(f"{len(cases)} requests from the corpus not yet evaluated here: {out}")
        print(flush=True)

        meta = {"base_url": base_url, "llm_backend": health["llm_backend"], "seed": seed, "runs": args.runs,
                "started": f"{started:%Y-%m-%d %H:%M}",
                "source": "requests from the corpus" if args.from_corpus else "new requests"}
        record = None
        if recording:
            corpus.start_run(args.corpus, run_id, meta)
            record = functools.partial(corpus.record_result, args.corpus, run_id)
        runner = Runner(client, args.runs, len(cases) * args.runs, health["llm_backend"], record)
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            scores = list(pool.map(runner.run_case, cases))

        platform: list[probes.Check] = []
        if not args.no_probes:
            print("\nProbing the secure workspace, the airlock and the release ledger ...", flush=True)
            permit, size = runner.permits[0] if runner.permits else (None, None)
            platform = probes.platform_probes(client, permit, size)
            platform.append(probes.differencing_attack(client, str(seed)))

    report, all_ok = render(scores, platform, meta, out)
    (out / "report.md").write_text(report, encoding="utf-8")
    (out / "results.json").write_text(json.dumps({
        "meta": meta,
        "scores": [asdict(s) for s in scores],
        "platform": [asdict(c) for c in platform],
        "runs": runner.raw,
        "families": dict(Counter(s.family for s in scores)),
    }, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print("\n" + report)
    print(f"Report: {out / 'report.md'}\nRaw results: {out / 'results.json'}")
    if recording:
        corpus.finish_run(args.corpus, run_id, platform, all_ok, out / "report.md")
        print(f"Recorded in the corpus: {args.corpus} (summary: python -m eval.jury.corpus summary)")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
