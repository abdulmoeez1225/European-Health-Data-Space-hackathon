"""Secure processing environment (Art. 73).

Each permit gets its own DuckDB file holding only the cohort's patients and the
record types the request names, with patient IDs kept (pseudonymised). Inside
it researchers may run read-only SELECTs with a capped result size. Nothing is
downloadable; results leave only through the airlock, which takes no SQL: it
computes patient counts per allowlisted group itself and suppresses small cells.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Literal

import duckdb
from pydantic import BaseModel, Field

from backend import audit
from backend.compiler import cohort_sql
from backend.db import connection
from backend.models import SpeOutput
from backend.plan import QueryPlan, RecordSelection
from backend.stats import LESS_THAN, MIN_CELL, SUPPRESSED

COHORT_TABLE = "cohort"
DEFAULT_ACTOR = "researcher"
_PERMIT_ID = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
_CODE_COLUMN = {
    "conditions": "icd10",
    "medications": "atc",
    "observations": "loinc",
    "encounters": "primary_icd10",
}
_LOGGED_SQL_CHARS = 300

# One console query shows a page of records, not a table: browsing stays possible,
# bulk copying out of the workspace in a single call does not.
MAX_ROWS = 200
MAX_COLUMNS = 30
MAX_CELL_CHARS = 200
TRUNCATION_MARK = "…"
# Aggregates that fold many rows into one value would carry a whole table in one cell.
_ROW_FOLDING = frozenset({
    "string_agg", "group_concat", "listagg", "list", "array_agg", "json_group_array",
    "json_group_object", "json_group_structure", "histogram", "histogram_exact", "approx_top_k",
})
# min(x, n), arg_max(x, y, n) and friends return the top n values as a list.
_TOP_N_ARITY = {"min": 1, "max": 1, "arg_min": 2, "arg_max": 2, "argmin": 2, "argmax": 2, "min_by": 2, "max_by": 2}

# The airlock groups only by categorical, low-cardinality columns and by the year of a date;
# identifiers, exact dates and free numbers never become group labels.
_CATEGORICAL = frozenset({
    "icd10", "primary_icd10", "description", "atc", "name", "loinc", "unit", "type", "sex", "region", "data_holder",
})
_YEAR_OF = {"onset_year": "onset_date", "start_year": "start_date", "end_year": "end_date", "year": "date"}
_MEANS = frozenset({"value", "age"})
MAX_GROUP_BY = 3


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
    airlock_group_by: list[str] = Field(description="Group keys the airlock accepts for this table.")
    airlock_means: list[str] = Field(description="Numeric columns the airlock can average.")


class SpeInfo(BaseModel):
    permit_id: str
    tables: list[SpeTable]


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool = False
    truncated_cells: int = Field(0, description=f"Values cut to {MAX_CELL_CHARS} characters, ending in '…'.")


class AirlockFilter(BaseModel):
    column: str
    op: Literal["starts_with", "contains", "equals"]
    value: str = Field(min_length=1, max_length=100)


class AirlockRequest(BaseModel):
    """An aggregate the airlock computes itself: distinct patients per group, optionally a mean."""

    table: str
    group_by: list[str] = Field(min_length=1, max_length=MAX_GROUP_BY)
    mean: str | None = None
    filter: AirlockFilter | None = None


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


def delete_spe(permit_id: str) -> None:
    """Close a withdrawn permit: its database is removed and further queries return not found."""
    try:
        path = _existing_path(permit_id)
    except SpeNotFound:
        return
    path.unlink()
    audit.record("spe_deleted", "staff", permit_id)


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


def _airlock_group_by(columns: list[str]) -> list[str]:
    if "patient_id" not in columns:
        return []
    year_keys = {source: key for key, source in _YEAR_OF.items()}
    return [column if column in _CATEGORICAL else year_keys[column]
            for column in columns if column in _CATEGORICAL or column in year_keys]


def _airlock_means(columns: list[str]) -> list[str]:
    return [column for column in columns if column in _MEANS] if "patient_id" in columns else []


def spe_info(permit_id: str) -> SpeInfo:
    con = _open_read_only(_existing_path(permit_id))
    try:
        names = [row[0] for row in con.execute("SELECT table_name FROM duckdb_tables() ORDER BY table_name").fetchall()]
        tables = []
        for name in names:
            count_row = con.execute(f'SELECT count(*) FROM "{name}"').fetchone()
            assert count_row is not None
            rows = count_row[0]
            columns = _columns(con, name)
            tables.append(SpeTable(
                name=name, rows=rows, columns=columns,
                airlock_group_by=_airlock_group_by(columns), airlock_means=_airlock_means(columns),
            ))
    finally:
        con.close()
    return SpeInfo(permit_id=permit_id, tables=tables)


def _columns(con: duckdb.DuckDBPyConnection, table: str) -> list[str]:
    rows = con.execute(
        "SELECT column_name FROM duckdb_columns() WHERE table_name = ? ORDER BY column_index", [table]
    ).fetchall()
    return [row[0] for row in rows]


def _check_select(sql: str) -> None:
    try:
        statements = duckdb.extract_statements(sql)
    except duckdb.Error as error:
        raise SpeBlocked(f"SQL could not be parsed: {error}") from error
    if len(statements) != 1:
        raise SpeBlocked("exactly one statement is allowed")
    if statements[0].type != duckdb.StatementType.SELECT:
        raise SpeBlocked(f"only SELECT is allowed inside the secure environment, not {statements[0].type.name}")


def _function_calls(node: Any) -> Iterator[tuple[str, int]]:
    """(name, argument count) of every function in a serialised DuckDB syntax tree."""
    if isinstance(node, dict):
        if "function_name" in node:
            yield node["function_name"].lower(), len(node.get("arguments") or node.get("children") or [])
        for child in node.values():
            yield from _function_calls(child)
    elif isinstance(node, list):
        for child in node:
            yield from _function_calls(child)


def _check_functions(con: duckdb.DuckDBPyConnection, sql: str) -> None:
    row = con.execute("SELECT json_serialize_sql(?)", [sql]).fetchone()
    assert row is not None
    tree = json.loads(row[0])
    if tree.get("error"):
        raise SpeBlocked(f"SQL could not be checked: {tree.get('error_message', 'unknown error')}")
    for name, arguments in _function_calls(tree):
        if name in _ROW_FOLDING or arguments > _TOP_N_ARITY.get(name, arguments):
            raise SpeBlocked(f"{name}() combines many records into one value; query the records row by row")


def _cap_cell(value: Any) -> tuple[Any, bool]:
    text = value if isinstance(value, str) else str(value) if isinstance(value, (list, tuple, dict, bytes)) else None
    if text is None or len(text) <= MAX_CELL_CHARS:
        return value, False
    return text[:MAX_CELL_CHARS] + TRUNCATION_MARK, True


def _execute(permit_id: str, sql: str, limit: int) -> QueryResult:
    _check_select(sql)
    con = _open_read_only(_existing_path(permit_id))
    try:
        _check_functions(con, sql)
        cursor = con.execute(sql)
        columns = [d[0] for d in cursor.description]
        if len(columns) > MAX_COLUMNS:
            raise SpeBlocked(f"at most {MAX_COLUMNS} columns per query")
        fetched = cursor.fetchmany(limit + 1)
    except duckdb.PermissionException as error:
        raise SpeBlocked("access to files and external resources is disabled in the secure environment") from error
    except duckdb.Error as error:
        raise SpeQueryError(str(error)) from error
    finally:
        con.close()
    rows, truncated_cells = [], 0
    for record in fetched[:limit]:
        row = []
        for value in record:
            capped, cut = _cap_cell(value)
            row.append(capped)
            truncated_cells += cut
        rows.append(row)
    return QueryResult(columns=columns, rows=rows, truncated=len(fetched) > limit, truncated_cells=truncated_cells)


def _audit_sql(sql: str) -> dict:
    return {"sql": sql[:_LOGGED_SQL_CHARS]}


def run_query(permit_id: str, sql: str, limit: int = MAX_ROWS, actor: str = DEFAULT_ACTOR) -> QueryResult:
    try:
        result = _execute(permit_id, sql, min(limit, MAX_ROWS))
    except SpeBlocked as blocked:
        audit.record("spe_query_blocked", actor, permit_id, {**_audit_sql(sql), "reason": blocked.reason})
        raise
    audit.record("spe_query", actor, permit_id, {**_audit_sql(sql), "rows": len(result.rows)})
    return result


def block_download(permit_id: str, actor: str) -> audit.AuditEvent:
    return audit.record(
        "download_blocked", actor, permit_id,
        {"reason": "Art. 73: data stays inside the secure processing environment"},
    )


def _airlock_reasons(request: AirlockRequest, columns: list[str]) -> list[str]:
    if not columns:
        return [f"table '{request.table}' is not in this workspace"]
    allowed = _airlock_group_by(columns)
    if not allowed:
        return [f"table '{request.table}' cannot be summarised by patient"]
    listed = ", ".join(allowed)
    reasons = [f"'{key}' cannot be grouped by; allowed: {listed}" for key in request.group_by if key not in allowed]
    if len(set(request.group_by)) != len(request.group_by):
        reasons.append("each group column may appear only once")
    if request.filter and request.filter.column not in allowed:
        reasons.append(f"'{request.filter.column}' cannot be filtered on; allowed: {listed}")
    if request.mean is not None and request.mean not in _airlock_means(columns):
        means = ", ".join(_airlock_means(columns)) or "none"
        reasons.append(f"'{request.mean}' cannot be averaged; allowed: {means}")
    return reasons


def _key_expression(key: str) -> str:
    return f'year("{_YEAR_OF[key]}")' if key in _YEAR_OF else f'"{key}"'


def _summary_sql(request: AirlockRequest) -> tuple[str, list[str]]:
    """Distinct patients per group, counted by the server; only allowlisted names reach this string."""
    select = [f'{_key_expression(key)} AS "{key}"' for key in request.group_by]
    select.append("count(DISTINCT patient_id) AS n")
    if request.mean:
        select.append(f'round(avg("{request.mean}"), 2) AS "mean_{request.mean}"')
    sql = f'SELECT {", ".join(select)} FROM "{request.table}"'
    params: list[str] = []
    if request.filter:
        text = f"CAST({_key_expression(request.filter.column)} AS VARCHAR)"
        value = request.filter.value.strip()
        if request.filter.op == "equals":
            sql += f" WHERE {text} = ?"
            params.append(value)
        else:
            sql += f" WHERE {request.filter.op}(lower({text}), ?)"
            params.append(value.lower())
    keys = ", ".join(str(i) for i in range(1, len(request.group_by) + 1))
    return f"{sql} GROUP BY ALL ORDER BY n DESC, {keys}", params


def _suppress_small_rows(rows: list[list[Any]], n_index: int) -> tuple[list[list[Any]], int]:
    """Rows under the small-cell threshold keep their group label; count and mean are withheld."""
    released, suppressed = [], 0
    for row in rows:
        if row[n_index] >= MIN_CELL:
            released.append(row)
            continue
        suppressed += 1
        released.append([*row[:n_index], LESS_THAN, *(SUPPRESSED for _ in row[n_index + 1:])])
    return released, suppressed


def airlock_export(permit_id: str, request: AirlockRequest) -> AirlockResult:
    """Output check: the airlock builds the aggregate itself and suppresses small cells."""
    con = _open_read_only(_existing_path(permit_id))
    try:
        reasons = _airlock_reasons(request, _columns(con, request.table))
        if reasons:
            audit.record(
                "airlock_blocked", DEFAULT_ACTOR, permit_id, {"request": request.model_dump(), "reasons": reasons},
            )
            return AirlockResult(status="blocked", reasons=reasons)
        sql, params = _summary_sql(request)
        cursor = con.execute(sql, params)
        columns = [d[0] for d in cursor.description]
        rows = [list(row) for row in cursor.fetchall()]
    finally:
        con.close()

    released, suppressed = _suppress_small_rows(rows, len(request.group_by))
    audit.record(
        "airlock_released", DEFAULT_ACTOR, permit_id,
        {"request": request.model_dump(), "rows": len(released), "suppressed_rows": suppressed},
    )
    return AirlockResult(status="released", columns=columns, rows=released)
