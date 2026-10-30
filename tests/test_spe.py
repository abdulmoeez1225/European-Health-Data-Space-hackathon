import pytest
from pydantic import ValidationError

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
    con = spe._open_read_only(spe._path(PERMIT))
    try:
        for table in output.tables:
            ids = {r[0] for r in con.execute(f"SELECT DISTINCT patient_id FROM {table}").fetchall()}
            assert not ids & opted_out, table
    finally:
        con.close()


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


@pytest.mark.parametrize("sql", [
    "SELECT string_agg(patient_id || ':' || CAST(value AS VARCHAR), ';') FROM observations",
    "SELECT group_concat(icd10) FROM conditions",
    "SELECT list(patient_id) FROM cohort",
    "SELECT \"array_agg\"(patient_id) FROM cohort",
    "SELECT ARRAY(SELECT patient_id FROM cohort)",
    "SELECT json_group_array(patient_id) FROM cohort",
    "SELECT string_agg(patient_id) OVER () FROM cohort LIMIT 1",
    "SELECT max(patient_id, 500) FROM cohort",
])
def test_query_refuses_aggregates_that_fold_rows_into_one_value(output, sql: str) -> None:
    with pytest.raises(spe.SpeBlocked, match="combines many records"):
        spe.run_query(PERMIT, sql)


def test_query_caps_rows_columns_and_cell_length(output) -> None:
    result = spe.run_query(PERMIT, "SELECT * FROM conditions", limit=100000)
    assert len(result.rows) == spe.MAX_ROWS and result.truncated and result.truncated_cells == 0

    long = spe.run_query(PERMIT, "SELECT repeat('x', 5000) AS s, 'short' AS t")
    assert long.rows == [["x" * spe.MAX_CELL_CHARS + spe.TRUNCATION_MARK, "short"]]
    assert long.truncated_cells == 1

    wide = ", ".join(f"lead(patient_id, {i}) OVER ()" for i in range(1, spe.MAX_COLUMNS + 2))
    with pytest.raises(spe.SpeBlocked, match="columns"):
        spe.run_query(PERMIT, f"SELECT {wide} FROM cohort")


def test_workspace_lists_what_the_airlock_accepts(output) -> None:
    tables = {t.name: t for t in spe.spe_info(PERMIT).tables}
    assert tables["cohort"].airlock_group_by == []
    assert tables["conditions"].airlock_group_by == ["icd10", "description", "onset_year"]
    assert tables["observations"].airlock_means == ["value"]


def test_airlock_takes_no_sql(output) -> None:
    with pytest.raises(ValidationError):
        spe.AirlockRequest.model_validate(
            {"sql": "SELECT upper(patient_id) AS pid, icd10, onset_date, 100 AS n FROM conditions"}
        )


@pytest.mark.parametrize("group_by", [
    ["patient_id"], ["encounter_id"], ["onset_date"], ["md5(patient_id)"], ["upper(patient_id)"], ["icd10", "icd10"],
])
def test_airlock_refuses_identifying_or_unlisted_groups(output, group_by: list[str]) -> None:
    result = spe.airlock_export(PERMIT, spe.AirlockRequest(table="conditions", group_by=group_by))
    assert result.status == "blocked" and result.rows == [] and result.reasons
    assert "airlock_blocked" in _event_names()


def test_airlock_refuses_unknown_table_filter_and_mean(output) -> None:
    unknown = spe.airlock_export(PERMIT, spe.AirlockRequest(table="raw_patients", group_by=["sex"]))
    assert unknown.status == "blocked"
    request = spe.AirlockRequest(
        table="conditions", group_by=["icd10"], mean="patient_id",
        filter=spe.AirlockFilter(column="patient_id", op="equals", value="p-0000"),
    )
    result = spe.airlock_export(PERMIT, request)
    assert result.status == "blocked" and len(result.reasons) == 2


def test_airlock_counts_patients_itself_and_suppresses_small_rows(output) -> None:
    exact = spe.run_query(
        PERMIT, "SELECT atc, count(DISTINCT patient_id) AS n FROM medications GROUP BY atc ORDER BY n DESC, atc"
    ).rows
    assert any(row[1] < 10 for row in exact) and any(row[1] >= 10 for row in exact)

    result = spe.airlock_export(PERMIT, spe.AirlockRequest(table="medications", group_by=["atc"]))
    assert result.status == "released" and result.columns == ["atc", "n"]
    assert [row[0] for row in result.rows] == [row[0] for row in exact]
    for row, original in zip(result.rows, exact, strict=True):
        assert row[1] == (original[1] if original[1] >= 10 else "<10")
    assert "airlock_released" in _event_names()


def test_airlock_suppresses_the_mean_of_small_rows(output) -> None:
    request = spe.AirlockRequest(
        table="observations", group_by=["loinc", "year"], mean="value",
        filter=spe.AirlockFilter(column="loinc", op="starts_with", value="4548"),
    )
    result = spe.airlock_export(PERMIT, request)
    assert result.status == "released" and result.columns == ["loinc", "year", "n", "mean_value"]
    assert {row[0] for row in result.rows} == {"4548-4"}
    assert all(n >= 10 and 4 < mean < 15 for _, _, n, mean in result.rows)

    rows = [["E11", 2021, 12, 7.1], ["E11", 1997, 3, 9.9]]
    assert spe._suppress_small_rows(rows, n_index=2) == (
        [["E11", 2021, 12, 7.1], ["E11", 1997, "<10", "suppressed"]], 1,
    )
