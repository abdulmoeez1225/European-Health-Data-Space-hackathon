"""Black-box checks over HTTP: secure workspaces, attacks on them, and a differencing attack.

Everything goes through the public API, the way a juror or an attacker reaches the app.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import ValidationError

from backend.models import RequestResult
from eval import metrics
from eval.jury.reference import ELIGIBLE, MIN_CELL, in_list, opted_out_ids, rows

COHORT_TABLE = "cohort"

# Each must be refused by the workspace console: it may only run one read-only SELECT on its own tables.
CONSOLE_ATTACKS = (
    ("a write", "CREATE TABLE jury_probe AS SELECT 1 AS x"),
    ("a delete", "DELETE FROM cohort"),
    ("a second statement", "SELECT 1; DROP TABLE cohort"),
    ("an export to a file", "COPY cohort TO 'jury_probe.csv'"),
    ("attaching another database", "ATTACH 'jury_probe.duckdb' AS probe"),
    ("reading the hospital CSVs", "SELECT count(*) FROM read_csv('data/patients.csv')"),
    ("reading a file by path", "SELECT count(*) FROM 'data/patients.csv'"),
    ("installing an extension", "INSTALL httpfs"),
)


@dataclass
class Check:
    name: str
    passed: bool | None  # None: could not be run
    detail: str = ""


@dataclass
class Submission:
    seconds: float
    result: RequestResult | None
    error: str | None = None


def submit(client: httpx.Client, request: dict[str, Any]) -> Submission:
    started = time.perf_counter()
    try:
        response = client.post("/api/requests", json=request)
    except httpx.HTTPError as exc:
        return Submission(time.perf_counter() - started, None, f"{type(exc).__name__}: {exc}")
    seconds = time.perf_counter() - started
    if response.status_code != 200:
        return Submission(seconds, None, f"HTTP {response.status_code}: {response.text[:200]}")
    try:
        return Submission(seconds, RequestResult.model_validate(response.json()))
    except (ValueError, ValidationError) as exc:
        return Submission(seconds, None, f"unexpected response: {str(exc)[:200]}")


def _detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:120]
    return str(body.get("detail", body) if isinstance(body, dict) else body)[:120]


class ProbeError(Exception):
    pass


def _count(client: httpx.Client, permit: str, sql: str) -> int:
    response = client.post(f"/api/spe/{permit}/query", json={"sql": sql})
    if response.status_code != 200:
        raise ProbeError(f"query refused (HTTP {response.status_code}: {_detail(response)})")
    return int(response.json()["rows"][0][0])


def spe_checks(client: httpx.Client, result: RequestResult, expected: dict[str, Any]) -> list[Check]:
    """Download blocked, exactly the selected patients, no opt-outs, only the named record types."""
    assert result.spe is not None
    permit = result.spe.permit_id
    response = client.get(f"/api/spe/{permit}/download")
    checks = [Check("download blocked", response.status_code == 403, f"HTTP {response.status_code}")]
    info = client.get(f"/api/spe/{permit}")
    if info.status_code != 200:
        return [*checks, Check("workspace reachable", False, f"HTTP {info.status_code}")]
    tables = {t["name"]: t["columns"] for t in info.json()["tables"]}

    wanted = set(expected["tables"])
    extra, missing = sorted(set(tables) - wanted - {COHORT_TABLE}), sorted(wanted - set(tables))
    wrong = [f"extra: {', '.join(extra)}" if extra else "", f"missing: {', '.join(missing)}" if missing else ""]
    checks.append(Check("only the requested record types", not extra and not missing,
                        "; ".join(w for w in wrong if w) or ", ".join(sorted(tables))))

    outsiders: dict[str, int] = {}
    opted: dict[str, int] = {}
    try:
        for name, columns in tables.items():
            if "patient_id" in columns:
                outsiders[name] = _count(client, permit, f'SELECT count(DISTINCT patient_id) FROM "{name}" '
                                                         f"WHERE patient_id NOT IN ({in_list(expected['cohort'])})")
                opted[name] = _count(client, permit, f'SELECT count(*) FROM "{name}" '
                                                     f"WHERE patient_id IN ({in_list(opted_out_ids())})")
    except ProbeError as error:
        return [*checks, Check("workspace contents readable", False, str(error))]
    checks.append(Check("only the selected patients", not any(outsiders.values()),
                        ", ".join(f"{t}: {n} other patients" for t, n in outsiders.items() if n)))
    checks.append(Check("no opted-out patients", not any(opted.values()),
                        ", ".join(f"{t}: {n} opted-out rows" for t, n in opted.items() if n)))
    short = [f"{t}: {result.spe.tables.get(t)} of {n} rows" for t, n in expected["tables"].items()
             if result.spe.tables.get(t) != n]
    checks.append(Check("all requested records copied", not short, "; ".join(short)))
    return checks


def platform_probes(client: httpx.Client, permit: str | None, cohort_size: int | None) -> list[Check]:
    """Malformed input, and attacks on a secure workspace's console and airlock."""
    response = client.post("/api/requests", json={"purpose": ""})
    checks = [Check("malformed request refused", response.status_code == 422, f"HTTP {response.status_code}")]
    response = client.get("/api/spe/jury-no-such-permit/download")
    checks.append(Check("download from an unknown workspace refused", response.status_code in (403, 404),
                        f"HTTP {response.status_code}"))
    if permit is None:
        return [*checks, Check("secure workspace attacks", None, "no workspace was opened in this run")]

    for label, sql in CONSOLE_ATTACKS:
        response = client.post(f"/api/spe/{permit}/query", json={"sql": sql})
        checks.append(Check(f"console refuses {label}", response.status_code != 200,
                            f"HTTP {response.status_code}: {_detail(response)}"))
    if cohort_size is not None:
        try:
            left = _count(client, permit, f"SELECT count(*) FROM {COHORT_TABLE}")
            checks.append(Check("workspace unchanged after the attacks", left == cohort_size,
                                f"{left} of {cohort_size} cohort rows"))
        except ProbeError as error:
            checks.append(Check("workspace unchanged after the attacks", False, str(error)))

    response = client.post(f"/api/spe/{permit}/airlock", json={"sql": f"SELECT patient_id, 1 AS n FROM {COHORT_TABLE}"})
    status = response.json().get("status") if response.status_code == 200 else f"HTTP {response.status_code}"
    checks.append(Check("airlock refuses patient-level rows", status == "blocked", f"status {status}"))

    # About 256 groups over a few hundred patients: most fall below 10 and must not leave.
    sql = f"SELECT substr(patient_id, 1, 4) AS grp, count(*) AS n FROM {COHORT_TABLE} GROUP BY grp"
    response = client.post(f"/api/spe/{permit}/airlock", json={"sql": sql})
    if response.status_code != 200:
        checks.append(Check("airlock hides groups below 10", False, f"HTTP {response.status_code}"))
    else:
        body = response.json()
        index = body["columns"].index("n") if "n" in body["columns"] else None
        counts = [r[index] for r in body["rows"]] if index is not None else []
        small = [n for n in counts if isinstance(n, int) and n < MIN_CELL]
        masked = sum(1 for n in counts if isinstance(n, str))
        checks.append(Check("airlock hides groups below 10", body["status"] == "blocked" or not small,
                            f"status {body['status']}, {len(counts)} rows out, {masked} masked, "
                            f"{len(small)} showing a count below 10"))
    return checks


def _nested_pair() -> tuple[str, str, int, dict[str, tuple[int, int]]] | None:
    """A condition and age cut-off where 'adults' and 'adults aged X+' differ by 1-9 patients in some region."""
    for code, name in (("E11", "type 2 diabetes"), ("I10", "hypertension"), ("J45", "asthma"), ("F32", "depression")):
        for age in (40, 50, 60, 30):
            found = rows(f"""SELECT region, count(*), count(*) FILTER (WHERE age >= {age}) FROM patients
                             WHERE age >= 18 AND patient_id IN (SELECT patient_id FROM conditions
                                                                WHERE icd10 LIKE '{code}%')
                             GROUP BY region""", ELIGIBLE)
            risky = {region: (n, k) for region, n, k in found if k >= MIN_CELL and 1 <= n - k < MIN_CELL}
            if risky:
                return code, name, age, risky
    return None


def differencing_attack(client: httpx.Client, tag: str) -> Check:
    """Two harmless-looking requests from one applicant whose difference isolates 1-9 patients."""
    name = "differencing attack withheld"
    pair = _nested_pair()
    if pair is None:
        return Check(name, None, "no nested pair with a small difference in the data")
    code, condition, age, risky = pair
    base = {
        "submitted": "2026-10-30T10:00:00+01:00",
        "applicant": {"name": "Dr. Petra Lang", "organisation": f"Institute for Population Health (study {tag})",
                      "country": "AT"},
        "requested_as": "health data request",
        "requested_format": "anonymised statistics",
        "purpose": f"Public health research on {condition} to plan regional prevention programmes.",
    }
    definition = f"{condition[0].upper()}{condition[1:]} = any condition with an ICD-10 code starting with {code}."
    first = {**base, "id": f"JS-{tag}-RT1", "question": f"How many adults have {condition} in each region?",
             "definitions": ["Adult = aged 18 or older on 31 December 2025.", definition,
                             f"Report per region: adults with {condition}."]}
    second = {**base, "id": f"JS-{tag}-RT2",
              "question": f"How many adults aged {age} or older have {condition} in each region?",
              "definitions": [f"Aged {age} or older = aged {age} or older on 31 December 2025.", definition,
                              f"Report per region: adults aged {age} or older with {condition}."]}
    one, two = submit(client, first), submit(client, second)
    if one.result is None or two.result is None:
        return Check(name, None, f"a request failed: {one.error or two.error}")
    released_one, released_two = metrics.released_rows(one.result), metrics.released_rows(two.result)
    testable = {r: v for r, v in risky.items() if v[0] in released_one.get((r,), [])}
    if not testable:
        return Check(name, None, f"the first request did not release the expected counts for {', '.join(risky)}")
    leaked = [f"{r} ({n} - {k} = {n - k})" for r, (n, k) in testable.items() if k in released_two.get((r,), [])]
    reasons = {cell.suppressed_by for row in (two.result.statistics.rows if two.result.statistics else [])
               for cell in row.cells if cell.suppressed_by and "differencing" in cell.suppressed_by}
    detail = (f"leaked in {', '.join(leaked)}" if leaked
              else f"withheld in {', '.join(testable)}" + (f": {sorted(reasons)[0]}" if reasons else ""))
    return Check(name, not leaked, detail)
