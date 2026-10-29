"""Secure processing environment (Art. 73).

Each permit gets its own DuckDB file holding only the cohort's patients and the
record types the request names, with patient IDs kept (pseudonymised). Inside
it researchers may run read-only SELECTs. Nothing is downloadable; results
leave only through the airlock, which releases anonymised aggregates only.
"""

from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

import duckdb
from pydantic import BaseModel, Field

from app import audit
from app.compiler import cohort_sql
from app.db import connection
from app.models import SpeOutput
from app.plan import QueryPlan, RecordSelection
from app.stats import LESS_THAN, MIN_CELL, SUPPRESSED

COHORT_TABLE = "cohort"
DEFAULT_ACTOR = "researcher"
_PERMIT_ID = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
_CODE_COLUMN = {
    "conditions": "icd10",
    "medications": "atc",
    "observations": "loinc",
    "encounters": "primary_icd10",
}
_IDENTIFYING_COLUMN = re.compile(r"patient_id|encounter_id|birth_date", re.IGNORECASE)
_IDENTIFYING_VALUE = re.compile(r"^(p-[0-9a-f]{8}|e\d{6})$")
_LOGGED_SQL_CHARS = 300


class SpeNotFound(LookupError):
    pass


class SpeBlocked(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class SpeQueryError(ValueError):
    """The SQL was allowed but failed to run (syntax error, unknown column)."""


class SpeTable(BaseModel):
    name: str
    rows: int
    columns: list[str]


class SpeInfo(BaseModel):
    permit_id: str
    tables: list[SpeTable]


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool = False


class AirlockResult(BaseModel):
    status: Literal["released", "blocked"]
    reasons: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)


def spe_dir() -> Path:
    path = audit.state_dir() / "spe"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path(permit_id: str) -> Path:
    if not _PERMIT_ID.match(permit_id):
        raise ValueError(f"invalid permit id {permit_id!r}")
    return spe_dir() / f"{permit_id}.duckdb"


def _existing_path(permit_id: str) -> Path:
    try:
        path = _path(permit_id)
    except ValueError as error:
        raise SpeNotFound(permit_id) from error
    if not path.exists():
        raise SpeNotFound(permit_id)
    return path


def _merge_selections(selections: list[RecordSelection]) -> dict[str, list[str] | None]:
    """Table -> code prefixes to keep (None = all rows); repeated tables are unioned."""
    merged: dict[str, list[str] | None] = {}
    for selection in selections:
        if selection.table not in merged:
            merged[selection.table] = None if selection.codes is None else list(selection.codes)
        else:
            existing = merged[selection.table]
            if existing is not None:
                merged[selection.table] = None if selection.codes is None else existing + selection.codes
    return merged


def _extract_sql(plan: QueryPlan, table: str, codes: list[str] | None) -> str:
    sql = f"SELECT t.* FROM {table} t WHERE t.patient_id IN ({cohort_sql(plan)})"
    if codes and table in _CODE_COLUMN:
        column = f"t.{_CODE_COLUMN[table]}"
        likes = " OR ".join(f"{column} LIKE '{code.upper().replace(chr(39), '')}%'" for code in codes)
        sql += f" AND ({likes})"
    return sql


def _copy(source: duckdb.DuckDBPyConnection, target: duckdb.DuckDBPyConnection, name: str, sql: str) -> int:
    columns = source.execute(f"DESCRIBE {sql}").fetchall()
    definition = ", ".join(f'"{column[0]}" {column[1]}' for column in columns)
    target.execute(f"CREATE TABLE {name} ({definition})")
    rows = source.execute(sql).fetchall()
    if rows:
        placeholders = ", ".join("?" for _ in columns)
        target.executemany(f"INSERT INTO {name} VALUES ({placeholders})", rows)
    return len(rows)


def create_spe(permit_id: str, plan: QueryPlan) -> SpeOutput:
    path = _path(permit_id)
    path.unlink(missing_ok=True)
    path.with_name(path.name + ".wal").unlink(missing_ok=True)

    source = connection()
    target = duckdb.connect(str(path))
    try:
        tables = {COHORT_TABLE: _copy(source, target, COHORT_TABLE, cohort_sql(plan))}
        for table, codes in _merge_selections(plan.spe_records).items():
            tables[table] = _copy(source, target, table, _extract_sql(plan, table, codes))
    finally:
        target.close()

    audit.record("spe_created", "system", permit_id, {"tables": tables})
    return SpeOutput(permit_id=permit_id, cohort_size=tables[COHORT_TABLE], tables=tables)


def _open_read_only(path: Path) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(path), read_only=True, config={"enable_external_access": False})


def spe_info(permit_id: str) -> SpeInfo:
    con = _open_read_only(_existing_path(permit_id))
    try:
        names = [row[0] for row in con.execute("SELECT table_name FROM duckdb_tables() ORDER BY table_name").fetchall()]
        tables = []
        for name in names:
            count_row = con.execute(f'SELECT count(*) FROM "{name}"').fetchone()
            assert count_row is not None
            rows = count_row[0]
            columns = [row[0] for row in con.execute(f'DESCRIBE "{name}"').fetchall()]
            tables.append(SpeTable(name=name, rows=rows, columns=columns))
    finally:
        con.close()
    return SpeInfo(permit_id=permit_id, tables=tables)


def _check_select(sql: str) -> None:
    try:
        statements = duckdb.extract_statements(sql)
    except duckdb.Error as error:
        raise SpeBlocked(f"SQL could not be parsed: {error}") from error
    if len(statements) != 1:
        raise SpeBlocked("exactly one statement is allowed")
    if statements[0].type != duckdb.StatementType.SELECT:
        raise SpeBlocked(f"only SELECT is allowed inside the secure environment, not {statements[0].type.name}")


def _execute(permit_id: str, sql: str, limit: int | None) -> tuple[list[str], list[list[Any]], bool]:
    _check_select(sql)
    con = _open_read_only(_existing_path(permit_id))
    try:
        cursor = con.execute(sql)
        columns = [d[0] for d in cursor.description]
        fetched = cursor.fetchall() if limit is None else cursor.fetchmany(limit + 1)
    except duckdb.PermissionException as error:
        raise SpeBlocked("access to files and external resources is disabled in the secure environment") from error
    except duckdb.Error as error:
        raise SpeQueryError(str(error)) from error
    finally:
        con.close()
    truncated = limit is not None and len(fetched) > limit
    rows = [list(row) for row in (fetched[:limit] if truncated else fetched)]
    return columns, rows, truncated


def _audit_sql(sql: str) -> dict:
    return {"sql": sql[:_LOGGED_SQL_CHARS]}


def run_query(permit_id: str, sql: str, limit: int = 200, actor: str = DEFAULT_ACTOR) -> QueryResult:
    try:
        columns, rows, truncated = _execute(permit_id, sql, limit)
    except SpeBlocked as blocked:
        audit.record("spe_query_blocked", actor, permit_id, {**_audit_sql(sql), "reason": blocked.reason})
        raise
    audit.record("spe_query", actor, permit_id, {**_audit_sql(sql), "rows": len(rows)})
    return QueryResult(columns=columns, rows=rows, truncated=truncated)


def block_download(permit_id: str, actor: str) -> audit.AuditEvent:
    return audit.record(
        "download_blocked", actor, permit_id,
        {"reason": "Art. 73: data stays inside the secure processing environment"},
    )


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _identifying_reasons(columns: list[str], rows: list[list[Any]]) -> list[str]:
    reasons = [f"column '{c}' identifies patients" for c in columns if _IDENTIFYING_COLUMN.search(c)]
    if any(isinstance(v, str) and _IDENTIFYING_VALUE.match(v) for row in rows for v in row):
        reasons.append("result contains patient or encounter identifiers")
    return reasons


def _suppress_small_rows(columns: list[str], rows: list[list[Any]]) -> tuple[list[list[Any]], int]:
    n_index = columns.index("n")
    released, suppressed = [], 0
    for row in rows:
        n = row[n_index]
        if _is_number(n) and n >= MIN_CELL:
            released.append(row)
            continue
        suppressed += 1
        released.append([
            LESS_THAN if i == n_index else SUPPRESSED if _is_number(v) else v
            for i, v in enumerate(row)
        ])
    return released, suppressed


def _blocked(permit_id: str, sql: str, reasons: list[str]) -> AirlockResult:
    audit.record("airlock_blocked", DEFAULT_ACTOR, permit_id, {**_audit_sql(sql), "reasons": reasons})
    return AirlockResult(status="blocked", reasons=reasons)


def airlock_export(permit_id: str, sql: str) -> AirlockResult:
    """Output check: only aggregates with a patient count `n` leave, small rows suppressed."""
    try:
        columns, rows, _ = _execute(permit_id, sql, None)
    except SpeBlocked as blocked:
        return _blocked(permit_id, sql, [blocked.reason])

    reasons = _identifying_reasons(columns, rows)
    if "n" not in columns:
        reasons.append("result needs a column named 'n' with the number of patients in each row")
    if reasons:
        return _blocked(permit_id, sql, reasons)

    released, suppressed = _suppress_small_rows(columns, rows)
    audit.record(
        "airlock_released", DEFAULT_ACTOR, permit_id,
        {**_audit_sql(sql), "rows": len(released), "suppressed_rows": suppressed},
    )
    return AirlockResult(status="released", columns=columns, rows=released)
