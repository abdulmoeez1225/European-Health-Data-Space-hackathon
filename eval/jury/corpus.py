"""The evaluation corpus: every jury-simulator request and every evaluation of it, in one DuckDB file.

    .venv/bin/python -m eval.jury.corpus build --count 1000      # draw distinct requests (no LLM, no app needed)
    .venv/bin/python -m eval.jury.run_jury --from-corpus 200     # evaluate 200 not yet evaluated on that app
    .venv/bin/python -m eval.jury.corpus summary                 # coverage and results -> eval/jury/CORPUS.md

run_jury also adds the requests it draws itself and records every run, so the corpus grows with each test.
Requests are deduplicated by content (applicant, type, purpose, question, definitions).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from random import Random
from typing import TYPE_CHECKING, Any, get_args

import duckdb

from eval.jury import generate
from eval.jury.reference import rows as data_rows

if TYPE_CHECKING:
    from eval.jury.probes import Check
    from eval.jury.run_jury import CaseScore

HERE = Path(__file__).resolve().parent
CORPUS_PATH = HERE / "corpus.duckdb"
SUMMARY_PATH = HERE / "CORPUS.md"

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS requests (
    fingerprint VARCHAR PRIMARY KEY, request_id VARCHAR, seed BIGINT, family VARCHAR,
    expected_decision VARCHAR, expected_articles VARCHAR,
    {", ".join(f"{key} VARCHAR" for key in generate.TAG_KEYS)},
    added TIMESTAMP, request VARCHAR, expected VARCHAR
);
CREATE TABLE IF NOT EXISTS runs (
    run_id VARCHAR PRIMARY KEY, started TIMESTAMP, target VARCHAR, llm_backend VARCHAR, seed BIGINT,
    repeats INTEGER, requests INTEGER, all_passed BOOLEAN, report VARCHAR
);
CREATE TABLE IF NOT EXISTS results (
    run_id VARCHAR, fingerprint VARCHAR, request_id VARCHAR, family VARCHAR, decision VARCHAR, articles VARCHAR,
    decision_ok BOOLEAN, numbers_applicable BOOLEAN, numbers_ok BOOLEAN, numbers_note VARCHAR, leaks INTEGER,
    leak_details VARCHAR, consistent BOOLEAN, answered INTEGER, slowest_s DOUBLE, letter_ok BOOLEAN,
    spe_ok BOOLEAN, cached_runs INTEGER, errors VARCHAR, PRIMARY KEY (run_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS probes (run_id VARCHAR, name VARCHAR, passed BOOLEAN, detail VARCHAR);
-- The app answered without its LLM (provider down or out of quota): kept, but not scored and evaluated again.
ALTER TABLE results ADD COLUMN IF NOT EXISTS llm_unavailable BOOLEAN DEFAULT false;
"""


def connect(path: Path = CORPUS_PATH) -> duckdb.DuckDBPyConnection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(path))
    con.execute(_SCHEMA)
    return con


def _one(con: duckdb.DuckDBPyConnection, sql: str) -> Any:
    row = con.execute(sql).fetchone()
    assert row is not None
    return row[0]


def fingerprint(request: dict[str, Any]) -> str:
    """Same applicant, type, purpose, question and definitions = same request, whatever its id."""
    organisation = re.sub(r" \(project [^)]*\)$", "", request["applicant"].get("organisation", ""))
    content = [organisation, request.get("requested_as"), request.get("purpose"), request.get("question"),
               request.get("definitions")]
    return hashlib.sha256(json.dumps(content, ensure_ascii=False).encode()).hexdigest()[:16]


def _seed(request_id: str) -> int | None:
    match = re.match(r"JS-(\d+)-\d+$", request_id)
    return int(match.group(1)) if match else None


def add(con: duckdb.DuckDBPyConnection, cases: Sequence[dict[str, Any]]) -> int:
    """Store new requests; returns how many were not in the corpus yet."""
    known = {r[0] for r in con.execute("SELECT fingerprint FROM requests").fetchall()}
    added = 0
    for case in cases:
        request, expected = case["request"], case["expected"]
        key = fingerprint(request)
        if key in known:
            continue
        tags = expected.get("tags", {})
        values = [key, request["id"], _seed(request["id"]), expected["family"], expected["decision"],
                  ",".join(expected["articles"]), *(tags.get(k, "") for k in generate.TAG_KEYS), datetime.now(),
                  json.dumps(request, ensure_ascii=False), json.dumps(expected, ensure_ascii=False)]
        con.execute(f"INSERT INTO requests VALUES ({', '.join('?' * len(values))})", values)
        known.add(key)
        added += 1
    return added


def build(con: duckdb.DuckDBPyConnection, count: int, first_seed: int | None, batch: int = 20) -> int:
    """Draw seeds until `count` new distinct requests are stored."""
    seed = first_seed if first_seed is not None else (_one(con, "SELECT max(seed) FROM requests") or 0) + 1
    added = misses = 0
    while added < count:
        new = add(con, generate.generate(seed, min(batch, max(count - added, len(generate.FAMILIES)))))
        added += new
        misses = 0 if new else misses + 1
        if misses >= 20:
            print("the generator keeps drawing requests that are already stored; stopping")
            break
        if seed % 10 == 0:
            print(f"seed {seed}: {added} new requests", flush=True)
        seed += 1
    return added


def pending(con: duckdb.DuckDBPyConnection, count: int, target: str, backend: str, seed: int,
            families: Sequence[str] | None = None) -> list[dict[str, Any]]:
    """Up to `count` stored requests not yet evaluated on this target and backend, mixed across families."""
    found = con.execute(
        """SELECT family, request, expected FROM requests WHERE fingerprint NOT IN (
               SELECT fingerprint FROM results JOIN runs USING (run_id)
               WHERE target = ? AND llm_backend = ? AND NOT llm_unavailable)
           ORDER BY fingerprint""",
        [target, backend],
    ).fetchall()
    by_family: dict[str, list[dict[str, Any]]] = {}
    for family, request, expected in found:
        if families is None or family in families:
            by_family.setdefault(family, []).append({"request": json.loads(request), "expected": json.loads(expected)})
    rng = Random(seed)
    for group in by_family.values():
        rng.shuffle(group)
    chosen: list[dict[str, Any]] = []
    while len(chosen) < count and any(by_family.values()):
        for family in sorted(by_family, key=lambda f: -generate.WEIGHTS.get(f, 1)):
            if by_family[family] and len(chosen) < count:
                chosen.append(by_family[family].pop())
    return chosen


def start_run(path: Path, run_id: str, meta: dict[str, Any]) -> None:
    """Results are written one by one, so an interrupted run keeps what it scored and the next resumes."""
    with connect(path) as con:
        con.execute("INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL)",
                    [run_id, datetime.now(), meta["base_url"], meta["llm_backend"], meta["seed"], meta["runs"]])


def record_result(path: Path, run_id: str, case: dict[str, Any], score: CaseScore) -> None:
    with connect(path) as con:
        add(con, [case])
        values = [run_id, fingerprint(case["request"]), score.request_id, score.family, score.decision,
                  ",".join(score.articles), score.decision_ok, score.numbers_applicable, score.numbers_ok,
                  score.numbers_note, len(score.leaks), json.dumps(score.leaks, ensure_ascii=False), score.consistent,
                  score.answered, score.slowest_s, not score.letter_problems,
                  all(c.passed for c in score.spe_checks) if score.spe_checks else None, score.cached_runs,
                  json.dumps(score.errors, ensure_ascii=False), score.llm_unavailable]
        con.execute(f"INSERT INTO results VALUES ({', '.join('?' * len(values))})", values)
        con.execute("UPDATE runs SET requests = requests + 1 WHERE run_id = ?", [run_id])


def finish_run(path: Path, run_id: str, platform: Sequence[Check], all_passed: bool, report: Path) -> None:
    with connect(path) as con:
        for check in platform:
            con.execute("INSERT INTO probes VALUES (?, ?, ?, ?)", [run_id, check.name, check.passed, check.detail])
        con.execute("UPDATE runs SET all_passed = ?, report = ? WHERE run_id = ?", [all_passed, str(report), run_id])


# --- summary ----------------------------------------------------------------------------------


def _pct(part: int, whole: int) -> str:
    return f"{part} of {whole} ({100 * part / whole:.1f} %)" if whole else "-"


def _codes(con: duckdb.DuckDBPyConnection, column: str) -> set[str]:
    values = con.execute(f"SELECT DISTINCT {column} FROM requests WHERE {column} <> ''").fetchall()
    return {code for (value,) in values for code in value.split("+")}


def _in_data(sql: str) -> set[str]:
    return {r[0] for r in data_rows(sql, "main") if r[0]}


def _table(header: Sequence[str], rows: Sequence[Sequence[Any]]) -> list[str]:
    return [f"| {' | '.join(header)} |", f"|{'---|' * len(header)}",
            *[f"| {' | '.join(str(v) for v in row)} |" for row in rows]]


def summary(con: duckdb.DuckDBPyConnection, source: str = "eval/jury/corpus.duckdb") -> str:
    from backend.models import AllowedPurpose, ProhibitedGround

    total = _one(con, "SELECT count(*) FROM requests")
    if not total:
        return "# Evaluation corpus\n\nThe corpus is empty. Run `python -m eval.jury.corpus build --count 1000`.\n"
    lines = ["# Evaluation corpus", "",
             f"Written {datetime.now():%Y-%m-%d %H:%M} by `python -m eval.jury.corpus summary` from `{source}`.", "",
             f"**{total} distinct synthetic requests**, each with an answer computed independently from the data "
             "(eval/jury/reference.py), the expected decision and articles, and tags for what it covers.", ""]

    families = con.execute("""SELECT family, count(*), string_agg(DISTINCT expected_decision, ', ')
                              FROM requests GROUP BY family ORDER BY 2 DESC""").fetchall()
    lines += ["## Request families", "", *_table(("Family", "Requests", "Expected decision"), families), ""]

    coverage = []
    for label, column, sql in (
        ("Conditions (ICD-10 groups)", "condition", "SELECT DISTINCT left(icd10, 3) FROM raw_conditions"),
        ("Drug classes (ATC)", "drug", "SELECT DISTINCT left(atc, 5) FROM raw_medications"),
        ("Lab tests (LOINC)", "lab", "SELECT DISTINCT loinc FROM raw_observations"),
        ("Main diagnoses of stays (primary_icd10)", "main_diagnosis",
         "SELECT DISTINCT left(primary_icd10, 3) FROM raw_encounters"),
        ("Encounter types", "encounter_type", "SELECT DISTINCT type FROM raw_encounters"),
    ):
        in_data, covered = _in_data(sql), _codes(con, column)
        missing = sorted(in_data - covered)
        coverage.append((label, f"{len(in_data & covered)} of {len(in_data)}",
                         "all" if not missing else "missing " + ", ".join(missing)))
    allowed = set(get_args(AllowedPurpose)) - {"none"}
    grounds = set(get_args(ProhibitedGround)) - {"none"}
    categories = _codes(con, "purpose_category")
    coverage += [
        ("Allowed purposes (Art. 53)", f"{len(allowed & categories)} of {len(allowed)}",
         ", ".join(sorted(allowed - categories)) or "all"),
        ("Prohibited uses (Art. 54)", f"{len(grounds & categories)} of {len(grounds)}",
         "not covered: " + ", ".join(sorted(grounds - categories)) if grounds - categories else "all"),
        ("Applicant types", str(len(_codes(con, "applicant_type"))), ""),
        ("Applicant countries", str(len(_codes(con, "country"))), ", ".join(sorted(_codes(con, "country")))),
        ("Groupings", str(len(_codes(con, "grouping"))), ", ".join(sorted(_codes(con, "grouping")))),
    ]
    lines += ["## Coverage of the data and the law", "", *_table(("What", "Covered", "Detail"), coverage), ""]

    for title, column in (("Applicant types", "applicant_type"), ("Purpose categories", "purpose_category"),
                          ("Wording of the definitions", "wording")):
        counts = con.execute(f"SELECT {column}, count(*) FROM requests GROUP BY 1 ORDER BY 2 DESC").fetchall()
        lines += [f"### {title}", "", *_table((title.split()[0], "Requests"), counts), ""]

    lines += ["## Evaluations", ""]
    evaluations = con.execute("""
        SELECT target, llm_backend, count(DISTINCT fingerprint), count(*), sum(answered),
               count(*) FILTER (decision_ok), count(*) FILTER (numbers_applicable AND numbers_ok),
               count(*) FILTER (numbers_applicable), count(*) FILTER (leaks > 0),
               count(*) FILTER (repeats > 1 AND consistent), count(*) FILTER (repeats > 1),
               median(slowest_s), quantile_cont(slowest_s, 0.95), max(slowest_s),
               count(*) FILTER (spe_ok), count(spe_ok), count(*) FILTER (letter_ok), count(*) FILTER (answered = 0)
        FROM results JOIN runs USING (run_id) WHERE NOT llm_unavailable GROUP BY ALL ORDER BY 3 DESC""").fetchall()
    fallbacks = con.execute("""SELECT target, llm_backend, count(*) FROM results JOIN runs USING (run_id)
                               WHERE llm_unavailable GROUP BY ALL""").fetchall()
    if not evaluations:
        return "\n".join([*lines, "No evaluations recorded yet: run `python -m eval.jury.run_jury --from-corpus 100` "
                                  "against a running app.", ""])
    table = []
    for (target, backend, distinct, n, submissions, decisions, numbers, numeric, leaking, consistent, repeated,
         p50, p95, slowest, spe_ok, spe_n, letters, failed) in evaluations:
        table.append((f"{target} ({backend})", distinct, submissions, _pct(decisions, n), _pct(numbers, numeric),
                      leaking, _pct(consistent, repeated), f"{p50:.1f} / {p95:.1f} / {slowest:.1f} s",
                      _pct(spe_ok, spe_n), _pct(letters, n), failed))
    lines += _table(("Target (LLM backend)", "Requests", "Submissions", "Correct decisions", "Correct numbers",
                     "Requests with leaks", "Consistent (2+ runs)", "Time median / p95 / max", "Workspaces correct",
                     "Letters complete", "Failed to answer"), table)
    if fallbacks:
        lines += ["", "Not scored, because the app's LLM did not answer and it fell back to keyword rules (provider "
                      "unavailable or out of quota); these requests are evaluated again by the next "
                      "`--from-corpus` run: " + "; ".join(f"{t} ({b}): {n}" for t, b, n in fallbacks) + "."]

    main_target, main_backend = evaluations[0][0], evaluations[0][1]
    per_family = con.execute("""
        SELECT family, count(*), count(*) FILTER (decision_ok),
               count(*) FILTER (numbers_applicable AND numbers_ok), count(*) FILTER (numbers_applicable),
               count(*) FILTER (leaks > 0)
        FROM results JOIN runs USING (run_id) WHERE target = ? AND llm_backend = ? AND NOT llm_unavailable
        GROUP BY family ORDER BY 2 DESC""",
                             [main_target, main_backend]).fetchall()
    lines += ["", f"### By family on {main_target} ({main_backend})", "",
              *_table(("Family", "Evaluated", "Correct decisions", "Correct numbers", "With leaks"),
                      [(f, n, _pct(d, n), _pct(k, m), leak) for f, n, d, k, m, leak in per_family])]

    failures = con.execute("""
        SELECT request_id, family, decision, numbers_note, leak_details, errors
        FROM results JOIN runs USING (run_id)
        WHERE target = ? AND llm_backend = ? AND NOT llm_unavailable
              AND (NOT decision_ok OR (numbers_applicable AND NOT numbers_ok) OR leaks > 0 OR answered = 0)
        ORDER BY started DESC LIMIT 25""", [main_target, main_backend]).fetchall()
    if failures:
        lines += ["", "### Failures (latest 25)", "",
                  *_table(("Request", "Family", "Decision", "Numbers", "Leaks", "Errors"),
                          [(r, f, d, n or "", "" if leaks == "[]" else leaks, "" if e == "[]" else e)
                           for r, f, d, n, leaks, e in failures])]

    probe_rows = con.execute("""SELECT name, count(*) FILTER (passed), count(passed) FROM probes
                                GROUP BY name ORDER BY name""").fetchall()
    if probe_rows:
        lines += ["", "### Attack and input probes (all runs)", "",
                  *_table(("Probe", "Passed"), [(name, f"{ok} of {n}") for name, ok, n in probe_rows])]

    lines += ["", "## Suggested wording", "", _claim(con, evaluations[0], coverage), "",
              "What this does not show: the requests come from 10 templates with randomised parameters and wording, "
              "so they cover the data and the categories of the law, not every way a request can be phrased. "
              "Results hold for the LLM backend named above; another model has to be measured again.", ""]
    return "\n".join(lines)


def _claim(con: duckdb.DuckDBPyConnection, evaluation: tuple, coverage: list[tuple[str, str, str]]) -> str:
    (target, backend, distinct, n, submissions, decisions, numbers, numeric, leaking, *_rest) = evaluation
    total = _one(con, "SELECT count(*) FROM requests")
    covered = {label: (value, detail) for label, value, detail in coverage}
    singular = {"Conditions (ICD-10 groups)": "condition", "Drug classes (ATC)": "drug class",
                "Lab tests (LOINC)": "lab test", "Main diagnoses of stays (primary_icd10)": "main diagnosis"}
    complete = [noun for label, noun in singular.items() if covered[label][1] == "all"]
    data_part = (f"every {', every '.join(complete[:-1])} and every {complete[-1]} in the dataset"
                 if len(complete) > 1 else "")
    return (f"> Gatekeeper was evaluated on {distinct} synthetic requests ({submissions} submissions) from a corpus of "
            f"{total} distinct requests: 10 request families, {covered['Applicant types'][0]} applicant types from "
            f"{covered['Applicant countries'][0]} countries, {covered['Allowed purposes (Art. 53)'][0]} allowed "
            f"purposes and {covered['Prohibited uses (Art. 54)'][0]} prohibited uses"
            f"{', covering ' + data_part if data_part else ''}. Checked against independently computed answers: "
            f"{100 * decisions / n:.1f} % correct decisions, "
            f"{100 * numbers / numeric if numeric else 0:.1f} % correct numbers, {leaking} privacy leaks "
            f"({backend} backend).")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["build", "summary"])
    parser.add_argument("--count", type=int, default=1000, help="build: new distinct requests to add")
    parser.add_argument("--first-seed", type=int, default=None, help="build: first seed (default: after the last)")
    parser.add_argument("--corpus", type=Path, default=CORPUS_PATH)
    parser.add_argument("--out", type=Path, default=SUMMARY_PATH, help="summary: Markdown file to write")
    args = parser.parse_args(argv)
    con = connect(args.corpus)
    try:
        if args.command == "build":
            added = build(con, args.count, args.first_seed)
            total = _one(con, "SELECT count(*) FROM requests")
            print(f"added {added} requests; the corpus holds {total} ({args.corpus})")
        else:
            path, root = args.corpus.resolve(), HERE.parent.parent
            source = path.relative_to(root) if path.is_relative_to(root) else path
            args.out.write_text(summary(con, source.as_posix()), encoding="utf-8")
            print(f"wrote {args.out}")
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
