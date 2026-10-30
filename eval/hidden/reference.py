"""Independent reference answers for the hidden request set.

One hand-written DuckDB query per request over the opt-out-free views, plus a
small re-implementation of the small-cell rule. Nothing here uses the query
plan, the compiler or backend.stats, so the expected values can cross-check them.

    .venv/bin/python -m eval.hidden.reference
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from backend.db import connection

HERE = Path(__file__).resolve().parent
MIN_CELL = 10

HOSPITALS = ["Klinikum Nord", "Klinikum Süd", "Klinikum West"]
REGIONS = [
    "Burgenland", "Kärnten", "Niederösterreich", "Oberösterreich", "Salzburg",
    "Steiermark", "Tirol", "Vorarlberg", "Wien",
]
SEXES = ["female", "male"]

STATISTICAL = ("APPROVE_STATISTICAL", ["53", "69"])
STATISTICAL_FOR_ACCESS = ("APPROVE_STATISTICAL", ["53", "66", "69"])
SPE = ("APPROVE_SPE", ["53", "66", "68", "73"])
REJECT = ("REJECT", ["54"])


def rows(sql: str) -> list[tuple]:
    return connection().execute(sql).fetchall()


def shown_count(n: int) -> int | str:
    return n if n >= MIN_CELL else "<10"


def shown_percent(numerator: int, denominator: int) -> float | str:
    if numerator < MIN_CELL or denominator < MIN_CELL:
        return "suppressed"
    return _one_decimal(Decimal(numerator) * 100 / Decimal(denominator))


def shown_mean(total: Decimal | int | None, n: int) -> float | str:
    if n < MIN_CELL or total is None:
        return "suppressed"
    return _one_decimal(Decimal(total) / n)


def _one_decimal(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def by_group(sql: str, width: int) -> dict[Any, tuple]:
    """The first `width` columns of each result row are the group key, the rest its values."""
    return {(r[0] if width == 1 else r[:width]): r[width:] for r in rows(sql)}


def h01() -> dict:
    found = by_group(
        """SELECT data_holder, count(*), sum(end_date - start_date)
           FROM encounters
           WHERE type = 'inpatient' AND primary_icd10 LIKE 'I50%'
             AND start_date >= DATE '2025-01-01' AND start_date <= DATE '2025-12-31'
           GROUP BY data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        n, days = found.get(hospital, (0, None))
        answer[hospital] = {"heart_failure_stays": shown_count(n), "mean_length_of_stay_days": shown_mean(days, n)}
    return answer


def h02() -> dict:
    found = by_group(
        """SELECT e.data_holder, count(*), count(*) FILTER (WHERE p.age >= 65)
           FROM encounters e JOIN patients p ON p.patient_id = e.patient_id
           WHERE e.type = 'inpatient' AND e.primary_icd10 LIKE 'S72%'
             AND e.start_date >= DATE '2023-01-01' AND e.start_date <= DATE '2025-12-31'
           GROUP BY e.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        total, older = found.get(hospital, (0, 0))
        answer[hospital] = {
            "hip_fracture_stays": shown_count(total),
            "stays_aged_65_plus": shown_count(older),
            "share_aged_65_plus_pct": shown_percent(older, total),
        }
    return answer


def h03() -> dict:
    found = by_group(
        """SELECT p.sex, count(*), count(DISTINCT e.patient_id)
           FROM encounters e JOIN patients p ON p.patient_id = e.patient_id
           WHERE e.type = 'inpatient' AND e.primary_icd10 LIKE 'J18%'
           GROUP BY p.sex""",
        1,
    )
    answer = {}
    for sex in SEXES:
        stays, patients = found.get(sex, (0, 0))
        answer[sex] = {"pneumonia_stays": shown_count(stays), "pneumonia_patients": shown_count(patients)}
    return answer


def h04() -> dict:
    found = by_group(
        """SELECT e.data_holder, count(*), count(*) FILTER (WHERE p.age >= 75)
           FROM encounters e JOIN patients p ON p.patient_id = e.patient_id
           WHERE e.type = 'emergency'
             AND e.start_date >= DATE '2025-01-01' AND e.start_date <= DATE '2025-12-31'
           GROUP BY e.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        total, older = found.get(hospital, (0, 0))
        answer[hospital] = {"emergency_visits": shown_count(total), "visits_aged_75_plus": shown_count(older)}
    return answer


def h05() -> dict:
    found = by_group(
        """WITH latest AS (
               SELECT patient_id, arg_max(value, date) AS egfr
               FROM observations WHERE loinc = '62238-1' GROUP BY patient_id)
           SELECT p.region, count(*), count(*) FILTER (WHERE latest.egfr < 60),
                  count(*) FILTER (WHERE latest.egfr < 45)
           FROM patients p JOIN latest ON latest.patient_id = p.patient_id
           WHERE p.age >= 18
           GROUP BY p.region""",
        1,
    )
    answer = {}
    for region in REGIONS:
        measured, below_60, below_45 = found.get(region, (0, 0, 0))
        answer[region] = {
            "adults_with_egfr": shown_count(measured),
            "adults_egfr_below_60": shown_count(below_60),
            "adults_egfr_below_45": shown_count(below_45),
            "share_below_45_pct": shown_percent(below_45, measured),
        }
    return answer


def h06() -> dict:
    found = by_group(
        """WITH latest AS (
               SELECT patient_id, arg_max(value, date) AS sbp
               FROM observations WHERE loinc = '8480-6' GROUP BY patient_id)
           SELECT p.sex, count(*), sum(latest.sbp)
           FROM patients p JOIN latest ON latest.patient_id = p.patient_id
           WHERE p.age >= 18
             AND p.patient_id IN (SELECT patient_id FROM conditions WHERE icd10 LIKE 'I10%')
           GROUP BY p.sex""",
        1,
    )
    answer = {}
    for sex in SEXES:
        n, total = found.get(sex, (0, None))
        answer[sex] = {"hypertensives_with_sbp": shown_count(n), "mean_systolic_bp": shown_mean(total, n)}
    return answer


def h07() -> dict:
    found = by_group(
        """SELECT CASE WHEN p.age <= 17 THEN '0-17' WHEN p.age <= 39 THEN '18-39'
                       WHEN p.age <= 64 THEN '40-64' ELSE '65+' END AS band,
                  count(*),
                  count(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM medications m
                      WHERE m.patient_id = p.patient_id AND m.atc LIKE 'R03AK%'
                        AND m.start_date <= DATE '2025-12-31'
                        AND (m.end_date IS NULL OR m.end_date >= DATE '2025-12-31')))
           FROM patients p
           WHERE p.patient_id IN (SELECT patient_id FROM conditions WHERE icd10 LIKE 'J45%')
           GROUP BY band""",
        1,
    )
    answer = {}
    for band in ["0-17", "18-39", "40-64", "65+"]:
        n, treated = found.get(band, (0, 0))
        answer[band] = {"asthma_patients": shown_count(n), "share_laba_ics_pct": shown_percent(treated, n)}
    return answer


def h08() -> dict:
    found = by_group(
        """WITH latest AS (
               SELECT patient_id, arg_max(value, date) AS egfr
               FROM observations WHERE loinc = '62238-1' GROUP BY patient_id)
           SELECT p.data_holder, p.sex, count(*), count(latest.egfr), sum(latest.egfr)
           FROM patients p LEFT JOIN latest ON latest.patient_id = p.patient_id
           WHERE p.patient_id IN (SELECT patient_id FROM conditions WHERE icd10 LIKE 'N18%')
           GROUP BY p.data_holder, p.sex""",
        2,
    )
    answer: dict = {}
    for hospital in HOSPITALS:
        answer[hospital] = {}
        for sex in SEXES:
            patients, with_value, total = found.get((hospital, sex), (0, 0, None))
            answer[hospital][sex] = {"ckd_patients": shown_count(patients), "mean_egfr": shown_mean(total, with_value)}
    return answer


def h09() -> dict:
    return {}


def h10() -> dict:
    return {}


def h11() -> dict:
    ((cohort,),) = rows(
        """SELECT count(DISTINCT p.patient_id)
           FROM patients p JOIN encounters e ON e.patient_id = p.patient_id
           WHERE p.age >= 18 AND e.type = 'inpatient' AND e.primary_icd10 LIKE 'I50%'
             AND e.start_date >= DATE '2023-01-01' AND e.start_date <= DATE '2025-12-31'"""
    )
    return {"cohort_size": cohort}


def h12() -> dict:
    found = by_group(
        """SELECT p.data_holder, count(*),
                  count(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM medications m
                      WHERE m.patient_id = p.patient_id AND m.atc LIKE 'R03BB04%'
                        AND m.start_date <= DATE '2025-12-31'
                        AND (m.end_date IS NULL OR m.end_date >= DATE '2025-12-31')))
           FROM patients p
           WHERE p.age >= 18
             AND p.patient_id IN (SELECT patient_id FROM conditions WHERE icd10 LIKE 'J44%')
           GROUP BY p.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        n, treated = found.get(hospital, (0, 0))
        answer[hospital] = {"copd_adults": shown_count(n), "tiotropium_pct": shown_percent(treated, n)}
    return answer


@dataclass(frozen=True)
class Reference:
    decision: tuple[str, list[str]]
    reason: str
    answer: Callable[[], dict]


REFERENCES: dict[str, Reference] = {
    "H01": Reference(STATISTICAL, "Hospital capacity planning is a policy-making purpose (Art. 53). Statistics answer the question (Art. 69).", h01),
    "H02": Reference(STATISTICAL, "Research on care organisation is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", h02),
    "H03": Reference(STATISTICAL, "Quality assurance and research are allowed purposes (Art. 53). Statistics answer the question (Art. 69).", h03),
    "H04": Reference(STATISTICAL, "Policy-making is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", h04),
    "H05": Reference(STATISTICAL, "Public health is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", h05),
    "H06": Reference(STATISTICAL, "Research and teaching are allowed purposes (Art. 53). Statistics answer the question (Art. 69).", h06),
    "H07": Reference(STATISTICAL, "Public health research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", h07),
    "H08": Reference(STATISTICAL, "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69). Small cells are suppressed.", h08),
    "H09": Reference(REJECT, "Using health data for credit decisions is prohibited (Art. 54).", h09),
    "H10": Reference(REJECT, "Developing harmful products such as irritant agents is prohibited (Art. 54).", h10),
    "H11": Reference(SPE, "Algorithm development is an allowed purpose (Art. 53). The model needs patient-level data (Art. 66). Access only inside a secure processing environment (Art. 68, 73).", h11),
    "H12": Reference(STATISTICAL_FOR_ACCESS, "Public health planning is an allowed purpose (Art. 53). Statistics answer the question, so pseudonymised records are not justified (Art. 66). Approved as statistics (Art. 69).", h12),
}


def build_expected() -> dict[str, dict]:
    expected = {}
    for request_id, ref in REFERENCES.items():
        decision, articles = ref.decision
        answer = ref.answer() if decision != "REJECT" else None
        expected[request_id] = {"decision": decision, "articles": articles, "reason": ref.reason, "answer": answer}
    return expected


def main() -> None:
    expected = build_expected()
    (HERE / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {HERE / 'expected.json'} ({len(expected)} requests)")


if __name__ == "__main__":
    main()
