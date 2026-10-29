import pytest

from backend import audit, spe
from backend.db import connection
from backend.stats import cohort_size
from tests.reference_plans import REFERENCE_PLANS

PLAN = REFERENCE_PLANS["R05"]
PERMIT = "permit-r05"


@pytest.fixture(scope="module", autouse=True)
def state_in_tmp(tmp_path_factory):
    state = tmp_path_factory.mktemp("state")
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(audit, "state_dir", lambda: state)
        audit._loaded_from = None
        yield
    audit._loaded_from = None


@pytest.fixture(scope="module")
def output(state_in_tmp):
    return spe.create_spe(PERMIT, PLAN)


def _event_names() -> list[str]:
    return [e.event for e in audit.events()]


def test_cohort_size_and_selected_tables_only(output) -> None:
    assert output.cohort_size == cohort_size(PLAN) == 1152
    assert set(output.tables) == {"cohort", "conditions", "medications", "observations"}
    info = spe.spe_info(PERMIT)
    assert {t.name for t in info.tables} == set(output.tables)
    assert {t.name: t.rows for t in info.tables} == output.tables


def test_observations_restricted_to_requested_loinc(output) -> None:
    result = spe.run_query(PERMIT, "SELECT DISTINCT loinc FROM observations")
    assert result.rows == [["4548-4"]]


def test_patient_ids_kept_and_limited_to_cohort(output) -> None:
    result = spe.run_query(
        PERMIT, "SELECT count(*) FROM conditions WHERE patient_id NOT IN (SELECT patient_id FROM cohort)"
    )
    assert result.rows == [[0]]
    assert spe.run_query(PERMIT, "SELECT patient_id FROM cohort LIMIT 1").rows[0][0].startswith("p-")


def test_no_opted_out_patient_in_any_table(output) -> None:
    opted_out = {r[0] for r in connection().execute("SELECT patient_id FROM raw_patients WHERE opted_out").fetchall()}
    assert opted_out
    for table in output.tables:
        ids = {r[0] for r in spe.run_query(PERMIT, f"SELECT DISTINCT patient_id FROM {table}", limit=100000).rows}
        assert not ids & opted_out, table


def test_recreating_overwrites(output) -> None:
    again = spe.create_spe(PERMIT, PLAN)
    assert again.tables == output.tables


def test_unknown_permit() -> None:
    with pytest.raises(spe.SpeNotFound):
        spe.spe_info("missing")
    with pytest.raises(spe.SpeNotFound):
        spe.run_query("../etc/passwd", "SELECT 1")


@pytest.mark.parametrize("sql", [
    "COPY (SELECT * FROM cohort) TO '/tmp/leak.csv'",
    "EXPORT DATABASE '/tmp/leak'",
    "ATTACH '/tmp/other.duckdb' AS other",
    "INSTALL httpfs",
    "CREATE TABLE x AS SELECT 1",
    "DELETE FROM cohort",
    "SELECT 1; SELECT 2",
    "SELECT * FROM read_csv('/etc/hosts')",
])
def test_non_select_and_file_access_blocked(output, sql: str) -> None:
    before = _event_names().count("spe_query_blocked")
    with pytest.raises(spe.SpeBlocked):
        spe.run_query(PERMIT, sql)
    assert _event_names().count("spe_query_blocked") == before + 1
    assert spe.spe_info(PERMIT).tables


def test_sql_error_is_not_a_block(output) -> None:
    with pytest.raises(spe.SpeQueryError):
        spe.run_query(PERMIT, "SELECT nope FROM cohort")


def test_query_limit_truncates(output) -> None:
    result = spe.run_query(PERMIT, "SELECT patient_id FROM cohort", limit=5)
    assert len(result.rows) == 5 and result.truncated
    assert "spe_query" in _event_names()


def test_download_is_blocked_and_audited(output) -> None:
    event = spe.block_download(PERMIT, actor="researcher-1")
    assert event.event == "download_blocked"
    assert audit.events()[0].id == event.id
    assert event.actor == "researcher-1" and event.subject == PERMIT


def test_audit_survives_restart(output) -> None:
    spe.block_download(PERMIT, actor="a")
    audit._loaded_from = None
    assert "download_blocked" in _event_names()
    assert "spe_created" in _event_names()


def test_airlock_blocks_patient_level_select(output) -> None:
    result = spe.airlock_export(PERMIT, "SELECT patient_id, icd10 FROM conditions")
    assert result.status == "blocked" and result.rows == []
    assert any("patient_id" in r for r in result.reasons)
    assert any("'n'" in r for r in result.reasons)
    assert "airlock_blocked" in _event_names()


def test_airlock_blocks_identifier_values_even_when_renamed(output) -> None:
    result = spe.airlock_export(PERMIT, "SELECT patient_id AS who, 1 AS n FROM cohort")
    assert result.status == "blocked"
    assert any("identifiers" in r for r in result.reasons)


def test_airlock_requires_patient_count_column(output) -> None:
    result = spe.airlock_export(PERMIT, "SELECT count(*) AS total FROM cohort")
    assert result.status == "blocked"


def test_airlock_blocks_non_select(output) -> None:
    result = spe.airlock_export(PERMIT, "COPY cohort TO '/tmp/leak.csv'")
    assert result.status == "blocked"


def test_airlock_suppresses_small_rows(output) -> None:
    sql = (
        "SELECT atc, count(DISTINCT patient_id) AS n, avg(1) AS share FROM medications "
        "GROUP BY atc ORDER BY n"
    )
    exact = spe.run_query(PERMIT, sql).rows
    assert any(row[1] < 10 for row in exact) and any(row[1] >= 10 for row in exact)

    result = spe.airlock_export(PERMIT, sql)
    assert result.status == "released"
    for row, original in zip(result.rows, exact, strict=False):
        assert row[0] == original[0]
        if original[1] < 10:
            assert row[1:] == ["<10", "suppressed"]
        else:
            assert row[1:] == original[1:]
    assert "airlock_released" in _event_names()
