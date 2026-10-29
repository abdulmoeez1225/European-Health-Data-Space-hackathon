"""Central DuckDB database built from the hospital CSV extracts.

Raw tables are loaded once. Every query the app runs goes through the
`patients`, `conditions`, `medications`, `observations` and `encounters`
views, which already exclude patients who opted out (Art. 71).
"""

from __future__ import annotations

import threading
from datetime import date
from pathlib import Path

import duckdb

from backend.config import settings

DATA_DIR = settings().data_dir
REFERENCE_DATE = date(2025, 12, 31)

_RAW_TABLES = {
    "raw_patients": (
        "patients.csv",
        {"patient_id": "VARCHAR", "sex": "VARCHAR", "birth_date": "DATE", "region": "VARCHAR",
         "data_holder": "VARCHAR", "opted_out": "BOOLEAN"},
    ),
    "raw_conditions": (
        "conditions.csv",
        {"patient_id": "VARCHAR", "icd10": "VARCHAR", "description": "VARCHAR", "onset_date": "DATE"},
    ),
    "raw_medications": (
        "medications.csv",
        {"patient_id": "VARCHAR", "atc": "VARCHAR", "name": "VARCHAR", "start_date": "DATE", "end_date": "DATE"},
    ),
    "raw_observations": (
        "observations.csv",
        {"patient_id": "VARCHAR", "loinc": "VARCHAR", "name": "VARCHAR", "value": "DECIMAL(12,4)",
         "unit": "VARCHAR", "date": "DATE"},
    ),
    "raw_encounters": (
        "encounters.csv",
        {"encounter_id": "VARCHAR", "patient_id": "VARCHAR", "data_holder": "VARCHAR", "type": "VARCHAR",
         "start_date": "DATE", "end_date": "DATE", "primary_icd10": "VARCHAR"},
    ),
}

_ELIGIBLE_VIEWS = f"""
CREATE VIEW patients AS
    SELECT *, {REFERENCE_DATE.year} - year(birth_date) AS age
    FROM raw_patients WHERE NOT opted_out;
CREATE VIEW conditions AS
    SELECT * FROM raw_conditions WHERE patient_id IN (SELECT patient_id FROM patients);
CREATE VIEW medications AS
    SELECT * FROM raw_medications WHERE patient_id IN (SELECT patient_id FROM patients);
CREATE VIEW observations AS
    SELECT * FROM raw_observations WHERE patient_id IN (SELECT patient_id FROM patients);
CREATE VIEW encounters AS
    SELECT * FROM raw_encounters WHERE patient_id IN (SELECT patient_id FROM patients);
"""

_lock = threading.Lock()
_connection: duckdb.DuckDBPyConnection | None = None


def _build(data_dir: Path) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    for table, (file_name, columns) in _RAW_TABLES.items():
        con.execute(
            f"CREATE TABLE {table} AS SELECT * FROM read_csv(?, header=true, columns=?, nullstr='')",
            [str(data_dir / file_name), columns],
        )
    con.execute(_ELIGIBLE_VIEWS)
    return con


def connection() -> duckdb.DuckDBPyConnection:
    """A cursor on the shared in-memory database, safe to use from one thread."""
    global _connection
    with _lock:
        if _connection is None:
            _connection = _build(DATA_DIR)
        return _connection.cursor()
