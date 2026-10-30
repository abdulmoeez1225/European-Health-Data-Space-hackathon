"""Independent ground truth for the jury simulator.

The five CSVs are loaded into the simulator's own DuckDB database, with its own opt-out filter,
age rule and small-cell rule (Decimal, one decimal, halves up). Nothing here imports backend/,
so a bug in the app's views, compiler or statistics cannot hide in the expected answers.

Two schemas hold the same views: `eligible` leaves out opted-out patients (the truth) and
`everyone` keeps them, only to recognise an answer that forgot the opt-outs.
"""

from __future__ import annotations

import functools
from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
MIN_CELL = 10
REFERENCE_YEAR = 2025
ACTIVE_ON = "DATE '2025-12-31'"

ELIGIBLE = "eligible"
EVERYONE = "everyone"

_FILES = {
    "patients": "patients.csv",
    "conditions": "conditions.csv",
    "medications": "medications.csv",
    "observations": "observations.csv",
    "encounters": "encounters.csv",
}


@functools.cache
def _database() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    for table, file_name in _FILES.items():
        path = (DATA_DIR / file_name).as_posix().replace("'", "''")
        # Exact decimals, so a mean rounds the same way as the hand-checked answers.
        types = ", types={'value': 'DECIMAL(12,4)'}" if table == "observations" else ""
        con.execute(f"CREATE TABLE raw_{table} AS SELECT * FROM read_csv('{path}', header=true, nullstr=''{types})")
    con.execute(f"""
        CREATE SCHEMA {EVERYONE};
        CREATE VIEW {EVERYONE}.patients AS
            SELECT *, {REFERENCE_YEAR} - year(birth_date) AS age FROM main.raw_patients;
        CREATE SCHEMA {ELIGIBLE};
        CREATE VIEW {ELIGIBLE}.patients AS SELECT * FROM {EVERYONE}.patients WHERE opted_out IS NOT TRUE;
    """)
    for table in ("conditions", "medications", "observations", "encounters"):
        con.execute(f"CREATE VIEW {EVERYONE}.{table} AS SELECT * FROM main.raw_{table}")
        con.execute(
            f"CREATE VIEW {ELIGIBLE}.{table} AS SELECT * FROM main.raw_{table} "
            f"WHERE patient_id IN (SELECT patient_id FROM {ELIGIBLE}.patients)"
        )
    return con


def rows(sql: str, schema: str = ELIGIBLE) -> list[tuple]:
    """Run SQL against the `patients`, `conditions`, ... views of one schema."""
    cursor = _database().cursor()
    try:
        cursor.execute(f"SET search_path = '{schema}'")
        return cursor.execute(sql).fetchall()
    finally:
        cursor.close()


def scalar(sql: str, schema: str = ELIGIBLE) -> int:
    return int(rows(sql, schema)[0][0])


@functools.cache
def labels(dimension: str) -> tuple[str, ...]:
    """Every value a grouping can take, from the data itself."""
    column = {"region": "region", "hospital": "data_holder", "sex": "sex"}[dimension]
    return tuple(r[0] for r in rows(f"SELECT DISTINCT {column} FROM raw_patients ORDER BY 1", "main"))


@functools.cache
def opted_out_ids() -> tuple[str, ...]:
    return tuple(r[0] for r in rows("SELECT patient_id FROM raw_patients WHERE opted_out ORDER BY 1", "main"))


def eligible_count() -> int:
    return scalar("SELECT count(*) FROM patients")


def one_decimal(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def shown_count(n: int) -> int | str:
    return n if n >= MIN_CELL else "<10"


def shown_percent(numerator: int, denominator: int) -> float | str:
    if numerator < MIN_CELL or denominator < MIN_CELL:
        return "suppressed"
    return one_decimal(Decimal(numerator) * 100 / Decimal(denominator))


def shown_mean(total: Decimal | int | None, n: int) -> float | str:
    if n < MIN_CELL or total is None:
        return "suppressed"
    return one_decimal(Decimal(total) / n)


def in_list(values: Sequence[str]) -> str:
    """A SQL IN list of quoted string literals."""
    return ", ".join("'" + v.replace("'", "''") + "'" for v in values) or "NULL"
