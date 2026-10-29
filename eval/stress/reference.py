"""Independent reference answers for the stress request set S01-S20.

One hand-written DuckDB query per request over the opt-out-free views, plus its own
small-cell rule (Decimal, one decimal, halves up). Nothing here imports the query plan,
the compiler or backend.stats.

    .venv/bin/python -m eval.stress.reference
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from statistics import median
from typing import Any

from backend.db import connection

HERE = Path(__file__).resolve().parent
MIN_CELL = 10

HOSPITALS = ["Klinikum Nord", "Klinikum Süd", "Klinikum West"]
REGIONS = [
    "Burgenland",
    "Kärnten",
    "Niederösterreich",
    "Oberösterreich",
    "Salzburg",
    "Steiermark",
    "Tirol",
    "Vorarlberg",
    "Wien",
]
SEXES = ["female", "male"]

STATISTICAL = ("APPROVE_STATISTICAL", ["53", "69"])
STATISTICAL_FOR_ACCESS = ("APPROVE_STATISTICAL", ["53", "66", "69"])
SPE = ("APPROVE_SPE", ["53", "66", "68", "73"])
REJECT = ("REJECT", ["54"])

# Active on 31 Dec 2025: start_date <= day and (end_date is null or end_date >= day).
ACTIVE = "m.start_date <= DATE '2025-12-31' AND (m.end_date IS NULL OR m.end_date >= DATE '2025-12-31')"


def rows(sql: str) -> list[tuple]:
    return connection().execute(sql).fetchall()


def shown_count(n: int) -> int | str:
    return n if n >= MIN_CELL else "<10"


def _one_decimal(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def shown_percent(numerator: int, denominator: int) -> float | str:
    if numerator < MIN_CELL or denominator < MIN_CELL:
        return "suppressed"
    return _one_decimal(Decimal(numerator) * 100 / Decimal(denominator))


def shown_mean(total: Decimal | int | float | None, n: int) -> float | str:
    if n < MIN_CELL or total is None:
        return "suppressed"
    return _one_decimal(Decimal(str(total)) / n)


def by_group(sql: str, width: int) -> dict[Any, tuple]:
    """The first `width` columns of each result row are the group key, the rest its values."""
    return {(r[0] if width == 1 else r[:width]): r[width:] for r in rows(sql)}


def s01() -> dict:
    found = by_group(
        f"""WITH hf AS (
                SELECT p.patient_id, p.data_holder, p.age FROM patients p
                WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'I50%')),
            sbp AS (SELECT patient_id, arg_max(value, date) AS v FROM observations WHERE loinc = '8480-6' GROUP BY patient_id),
            loop AS (SELECT DISTINCT m.patient_id FROM medications m WHERE m.atc LIKE 'C03C%' AND {ACTIVE})
            SELECT hf.data_holder, count(*),
                   count(*) FILTER (WHERE hf.age > 75),
                   count(*) FILTER (WHERE sbp.v >= 140),
                   count(*) FILTER (WHERE loop.patient_id IS NOT NULL)
            FROM hf LEFT JOIN sbp ON sbp.patient_id = hf.patient_id
                    LEFT JOIN loop ON loop.patient_id = hf.patient_id
            GROUP BY hf.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        n, older, high_bp, diuretic = found.get(hospital, (0, 0, 0, 0))
        answer[hospital] = {
            "heart_failure_patients": shown_count(n),
            "older_than_75": shown_count(older),
            "latest_systolic_140_plus": shown_count(high_bp),
            "on_loop_diuretic": shown_count(diuretic),
        }
    return answer


def s02() -> dict:
    found = by_group(
        f"""SELECT p.region, count(*),
                   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM medications m
                                                  WHERE m.patient_id = p.patient_id AND m.atc LIKE 'C10AA%' AND {ACTIVE}))
            FROM patients p
            WHERE p.age >= 18
              AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id
                          AND (c.icd10 LIKE 'E11%' OR c.icd10 LIKE 'E66%'))
            GROUP BY p.region""",
        1,
    )
    answer = {}
    for region in REGIONS:
        n, statin = found.get(region, (0, 0))
        answer[region] = {
            "adults_t2d_or_obesity": shown_count(n),
            "on_statin": shown_count(statin),
            "statin_share_pct": shown_percent(statin, n),
        }
    return answer


def s03() -> dict:
    bands = ["under 40", "40-64", "65+"]
    found = by_group(
        """SELECT p.region,
                  CASE WHEN p.age < 40 THEN 'under 40' WHEN p.age <= 64 THEN '40-64' ELSE '65+' END AS band,
                  count(*)
           FROM patients p
           WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'E66%')
           GROUP BY 1, 2""",
        2,
    )
    return {
        region: {band: {"patients_with_obesity": shown_count(found.get((region, band), (0,))[0])} for band in bands}
        for region in REGIONS
    }


def s04() -> dict:
    found = by_group(
        """SELECT e.data_holder, count(*), count(DISTINCT e.patient_id), sum(e.end_date - e.start_date)
           FROM encounters e
           WHERE e.type = 'inpatient' AND (e.primary_icd10 LIKE 'J18%' OR e.primary_icd10 LIKE 'N39%')
             AND e.start_date >= DATE '2024-01-01' AND e.start_date <= DATE '2024-12-31'
           GROUP BY e.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        stays, patients, days = found.get(hospital, (0, 0, None))
        answer[hospital] = {
            "admissions": shown_count(stays),
            "distinct_patients": shown_count(patients),
            "mean_length_of_stay_days": shown_mean(days, stays),
        }
    return answer


def s05() -> dict:
    found = by_group(
        """SELECT e.data_holder, count(*), count(*) FILTER (WHERE e.type = 'emergency')
           FROM encounters e
           WHERE e.start_date >= DATE '2025-01-01' AND e.start_date <= DATE '2025-12-31'
           GROUP BY e.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        total, emergency = found.get(hospital, (0, 0))
        answer[hospital] = {
            "all_contacts": shown_count(total),
            "emergency_visits": shown_count(emergency),
            "emergency_share_pct": shown_percent(emergency, total),
        }
    return answer


def s06() -> dict:
    bands = ["under 50", "50-69", "70+"]
    found = by_group(
        """WITH latest AS (SELECT patient_id, arg_max(value, date) AS a1c FROM observations
                           WHERE loinc = '4548-4' GROUP BY patient_id)
           SELECT CASE WHEN p.age < 50 THEN 'under 50' WHEN p.age <= 69 THEN '50-69' ELSE '70+' END AS band,
                  count(*), count(latest.a1c), count(*) FILTER (WHERE latest.a1c > 8)
           FROM patients p LEFT JOIN latest ON latest.patient_id = p.patient_id
           WHERE p.data_holder = 'Klinikum Süd'
             AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'E11%')
           GROUP BY 1""",
        1,
    )
    answer = {}
    for band in bands:
        n, measured, poor = found.get(band, (0, 0, 0))
        answer[band] = {
            "t2d_patients": shown_count(n),
            "with_hba1c": shown_count(measured),
            "latest_hba1c_above_8": shown_count(poor),
            "share_above_8_pct": shown_percent(poor, measured),
        }
    return answer


def s07() -> dict:
    found = by_group(
        f"""SELECT p.region, count(*),
                   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM medications m
                                                  WHERE m.patient_id = p.patient_id AND m.atc = 'A10BA02' AND {ACTIVE}))
            FROM patients p
            WHERE EXISTS (SELECT 1 FROM medications m WHERE m.patient_id = p.patient_id AND m.atc = 'A10BA02')
            GROUP BY p.region""",
        1,
    )
    answer = {}
    for region in REGIONS:
        ever, active = found.get(region, (0, 0))
        answer[region] = {
            "ever_metformin": shown_count(ever),
            "active_metformin": shown_count(active),
            "active_share_pct": shown_percent(active, ever),
        }
    return answer


def s08() -> dict:
    found = by_group(
        """SELECT p.data_holder,
                  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id
                       AND c.icd10 LIKE 'F32%' AND c.onset_date >= DATE '2024-01-01' AND c.onset_date <= DATE '2024-12-31')),
                  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id
                       AND c.icd10 LIKE 'E66%' AND c.onset_date >= DATE '2024-01-01' AND c.onset_date <= DATE '2024-12-31'))
           FROM patients p GROUP BY p.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        depression, obesity = found.get(hospital, (0, 0))
        answer[hospital] = {"new_depression_2024": shown_count(depression), "new_obesity_2024": shown_count(obesity)}
    return answer


def none_answer() -> dict | None:
    return None


def s12() -> dict:
    found = by_group(
        """WITH latest AS (SELECT patient_id, arg_max(value, date) AS a1c FROM observations
                           WHERE loinc = '4548-4' AND date >= DATE '2023-01-01' AND date <= DATE '2023-12-31'
                           GROUP BY patient_id)
           SELECT p.sex, count(*), sum(latest.a1c)
           FROM patients p JOIN latest ON latest.patient_id = p.patient_id
           WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'E11%')
           GROUP BY p.sex""",
        1,
    )
    answer = {}
    for sex in SEXES:
        n, total = found.get(sex, (0, None))
        answer[sex] = {"t2d_with_hba1c_2023": shown_count(n), "mean_hba1c_2023": shown_mean(total, n)}
    return answer


def s17() -> dict:
    found = by_group(
        f"""SELECT p.sex, count(*), count(*) FILTER (WHERE p.age >= 75),
                   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id
                                                  AND c.icd10 LIKE 'N18%'))
            FROM patients p
            WHERE EXISTS (SELECT 1 FROM medications m WHERE m.patient_id = p.patient_id AND m.atc LIKE 'A10BK%' AND {ACTIVE})
            GROUP BY p.sex""",
        1,
    )
    answer = {}
    for sex in SEXES:
        n, older, ckd = found.get(sex, (0, 0, 0))
        answer[sex] = {
            "on_sglt2": shown_count(n),
            "aged_75_plus": shown_count(older),
            "with_ckd": shown_count(ckd),
            "ckd_share_pct": shown_percent(ckd, n),
        }
    return answer


def s18() -> dict:
    found = by_group(
        f"""SELECT p.data_holder, count(*),
                   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM medications m
                                                  WHERE m.patient_id = p.patient_id AND m.atc LIKE 'B01A%' AND {ACTIVE}))
            FROM patients p
            WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'I63%')
            GROUP BY p.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        n, anticoagulated = found.get(hospital, (0, 0))
        answer[hospital] = {
            "stroke_patients": shown_count(n),
            "with_active_anticoagulant": shown_count(anticoagulated),
            "share_pct": shown_percent(anticoagulated, n),
        }
    return answer


def s19() -> dict:
    found = by_group(
        """SELECT p.sex,
                  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'J45%')),
                  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'J44%'))
           FROM patients p WHERE p.age >= 18 AND p.region = 'Salzburg' GROUP BY p.sex""",
        1,
    )
    answer = {}
    for sex in SEXES:
        asthma, copd = found.get(sex, (0, 0))
        answer[sex] = {"adults_with_asthma": shown_count(asthma), "adults_with_copd": shown_count(copd)}
    return answer


S20_COHORT = """SELECT DISTINCT p.patient_id FROM patients p
                WHERE p.age >= 18 AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id
                                              AND c.icd10 IN ('I48.0', 'I48.2'))"""


def s20() -> dict:
    ((cohort,),) = rows(f"SELECT count(*) FROM ({S20_COHORT})")
    return {"cohort_size": cohort}


def s20_rows() -> dict[str, int]:
    return {
        table: rows(f"SELECT count(*) FROM {table} WHERE patient_id IN ({S20_COHORT})")[0][0]
        for table in ("conditions", "medications", "observations", "encounters")
    }


def s21() -> dict:
    found = by_group(
        """SELECT e.data_holder,
                  count(*) FILTER (WHERE e.primary_icd10 LIKE 'I50%'),
                  count(*) FILTER (WHERE e.primary_icd10 LIKE 'J18%'),
                  count(*) FILTER (WHERE e.primary_icd10 LIKE 'S72%')
           FROM encounters e
           WHERE e.type = 'inpatient' AND e.start_date >= DATE '2025-01-01' AND e.start_date <= DATE '2025-12-31'
           GROUP BY e.data_holder""",
        1,
    )
    answer = {}
    for hospital in HOSPITALS:
        heart, pneumonia, hip = found.get(hospital, (0, 0, 0))
        answer[hospital] = {
            "heart_failure_stays": shown_count(heart),
            "pneumonia_stays": shown_count(pneumonia),
            "hip_fracture_stays": shown_count(hip),
        }
    return answer


def s22() -> dict:
    found = by_group(
        """SELECT p.sex, count(*)
           FROM patients p
           WHERE EXISTS (SELECT 1 FROM medications m WHERE m.patient_id = p.patient_id AND m.atc = 'A10BA02'
                         AND m.start_date <= DATE '2024-12-31' AND (m.end_date IS NULL OR m.end_date >= DATE '2024-01-01'))
           GROUP BY p.sex""",
        1,
    )
    return {sex: {"on_metformin_during_2024": shown_count(found.get(sex, (0,))[0])} for sex in SEXES}


def s24() -> dict:
    found = by_group(
        """SELECT p.sex, count(*), count(*) FILTER (WHERE x.n >= 2)
           FROM patients p
           JOIN (SELECT patient_id, count(*) AS n FROM encounters
                 WHERE type = 'inpatient' AND start_date >= DATE '2023-01-01' AND start_date <= DATE '2025-12-31'
                 GROUP BY patient_id) x ON x.patient_id = p.patient_id
           GROUP BY p.sex""",
        1,
    )
    answer = {}
    for sex in SEXES:
        one, two = found.get(sex, (0, 0))
        answer[sex] = {"with_inpatient_stay": shown_count(one), "with_two_or_more": shown_count(two)}
    return answer


def s25() -> dict:
    found = by_group(
        """SELECT e.data_holder, CAST(year(e.start_date) AS VARCHAR), count(*), count(DISTINCT e.patient_id)
           FROM encounters e WHERE e.type = 'emergency' GROUP BY 1, 2""",
        2,
    )
    answer: dict = {}
    for hospital in HOSPITALS:
        answer[hospital] = {}
        for year in ("2023", "2024", "2025"):
            visits, patients = found.get((hospital, year), (0, 0))
            answer[hospital][year] = {
                "emergency_visits": shown_count(visits),
                "distinct_patients": shown_count(patients),
            }
    return answer


def s26() -> dict:
    found = by_group(
        """SELECT p.region, count(*) FROM patients p
           WHERE p.age >= 50 AND p.age <= 80
             AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'I50%')
           GROUP BY p.region""",
        1,
    )
    return {region: {"heart_failure_50_80": shown_count(found.get(region, (0,))[0])} for region in REGIONS}


def s27() -> dict:
    bands = ["0-39", "40-59", "60-79", "80+"]
    found = by_group(
        """SELECT p.sex, CASE WHEN p.age <= 39 THEN '0-39' WHEN p.age <= 59 THEN '40-59'
                              WHEN p.age <= 79 THEN '60-79' ELSE '80+' END AS band, count(*)
           FROM patients p
           WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'J44%')
           GROUP BY 1, 2""",
        2,
    )
    return {
        sex: {band: {"copd_patients": shown_count(found.get((sex, band), (0,))[0])} for band in bands} for sex in SEXES
    }


def ideal_values() -> dict[str, Any]:
    """What a system able to express S09-S11 would release. Diagnostic only, never in expected.json."""
    latest_bmi = rows(
        """WITH latest AS (SELECT patient_id, arg_max(value, date) AS bmi FROM observations
                          WHERE loinc = '39156-5' GROUP BY patient_id)
           SELECT p.region, latest.bmi FROM patients p JOIN latest ON latest.patient_id = p.patient_id
           WHERE p.age >= 18 AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'E11%')"""
    )
    median_bmi = {}
    for region in REGIONS:
        values = [Decimal(str(v)) for r, v in latest_bmi if r == region]
        median_bmi[region] = {
            "n": len(values),
            "median_bmi": _one_decimal(median(values)) if len(values) >= MIN_CELL else "suppressed",
        }
    per_1000 = {
        region: {
            "patients": n,
            "per_1000": _one_decimal(Decimal(hf) * 1000 / Decimal(n)) if hf >= MIN_CELL else "suppressed",
        }
        for region, n, hf in rows(
            """SELECT p.region, count(*),
                      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id
                                                     AND c.icd10 LIKE 'I50%'))
               FROM patients p GROUP BY p.region"""
        )
    }
    mean_age = {
        sex: {"n": n, "mean_age": shown_mean(total, n)}
        for sex, n, total in rows(
            """SELECT p.sex, count(*), sum(p.age) FROM patients p
               WHERE EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'I63%')
               GROUP BY p.sex"""
        )
    }
    quarters = {
        f"Q{int(q)}": n
        for q, n in rows(
            """SELECT quarter(start_date), count(*) FROM encounters
               WHERE type = 'inpatient' AND start_date >= DATE '2025-01-01' AND start_date <= DATE '2025-12-31'
               GROUP BY 1 ORDER BY 1"""
        )
    }
    return {
        "S09_median_bmi": median_bmi,
        "S10_per_1000": per_1000,
        "S11_mean_age": mean_age,
        "S23_per_quarter": quarters,
    }


@dataclass(frozen=True)
class Reference:
    decision: tuple[str, list[str]]
    reason: str
    answer: Callable[[], dict | None]
    note: str = ""


UNSUPPORTED = (
    "Not expressible with the query-plan DSL. Ideal behaviour: approve as statistics, but flag for staff "
    "review instead of releasing numbers computed with a different statistic."
)

REFERENCES: dict[str, Reference] = {
    "S01": Reference(
        STATISTICAL,
        "Service planning is a policy-making purpose (Art. 53). Statistics answer the question (Art. 69).",
        s01,
    ),
    "S02": Reference(
        STATISTICAL, "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s02
    ),
    "S03": Reference(
        STATISTICAL, "Public health is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s03
    ),
    "S04": Reference(
        STATISTICAL,
        "Quality management is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        s04,
    ),
    "S05": Reference(
        STATISTICAL, "Policy-making is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s05
    ),
    "S06": Reference(
        STATISTICAL, "Quality assurance is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s06
    ),
    "S07": Reference(
        STATISTICAL,
        "Health services research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        s07,
    ),
    "S08": Reference(
        STATISTICAL, "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s08
    ),
    "S09": Reference(
        STATISTICAL,
        "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        none_answer,
        UNSUPPORTED + " (median)",
    ),
    "S10": Reference(
        STATISTICAL,
        "Policy-making is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        none_answer,
        UNSUPPORTED + " (rate per 1,000)",
    ),
    "S11": Reference(
        STATISTICAL,
        "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        none_answer,
        UNSUPPORTED + " (mean age)",
    ),
    "S12": Reference(
        STATISTICAL,
        "Quality assurance is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        s12,
        "Mean of the latest value inside a date window (2023); the DSL can only restrict the cohort by date, not the averaged value. Overall-latest gives female 7.2 / male 7.1 instead of 7.1 / 7.3.",
    ),
    "S13": Reference(
        REJECT, "Using health data to refine insurance risk classes and tariffs is prohibited (Art. 54).", none_answer
    ),
    "S14": Reference(
        REJECT,
        "Using health data to place individual staff in programmes and appraisals is prohibited (Art. 54).",
        none_answer,
    ),
    "S15": Reference(
        REJECT,
        "Sponsored events to introduce a drug to specialists are marketing, not education (Art. 54).",
        none_answer,
    ),
    "S16": Reference(REJECT, "Positioning alcoholic beverages is prohibited (Art. 54).", none_answer),
    "S17": Reference(
        STATISTICAL,
        "Drug-safety research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        s17,
        "Allowed industry research; the words 'marketing authorisation holder' must not trigger a rejection.",
    ),
    "S18": Reference(
        STATISTICAL,
        "Research is an allowed purpose (Art. 53). A health data request is answered with statistics (Art. 69), not patient lists.",
        s18,
    ),
    "S19": Reference(
        STATISTICAL_FOR_ACCESS,
        "Public health monitoring is an allowed purpose (Art. 53). Convenience does not justify records (Art. 66). Approved as statistics (Art. 69).",
        s19,
    ),
    "S21": Reference(
        STATISTICAL,
        "Policy-making is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        s21,
        "Several main diagnoses side by side per hospital: each metric needs its own encounter-level filter.",
    ),
    "S22": Reference(
        STATISTICAL,
        "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        s22,
        "Prescription overlapping a period: the DSL only has 'active on one day' and 'started in a period'.",
    ),
    "S23": Reference(
        STATISTICAL,
        "Policy-making is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).",
        none_answer,
        UNSUPPORTED + " (group by quarter; only start_year exists)",
    ),
    "S24": Reference(
        STATISTICAL, "Research is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s24
    ),
    "S25": Reference(
        STATISTICAL, "Planning is an allowed purpose (Art. 53). Statistics answer the question (Art. 69).", s25
    ),
    "S26": Reference(
        STATISTICAL,
        "Trial feasibility is scientific research (Art. 53). Statistics answer the question (Art. 69).",
        s26,
        "Allowed: the word 'recruit' must not trigger a rejection; statistics cannot identify individuals.",
    ),
    "S27": Reference(
        STATISTICAL,
        "Tobacco control is a public health purpose (Art. 53). Statistics answer the question (Art. 69).",
        s27,
        "Allowed: the word 'tobacco' in a prevention purpose must not trigger a rejection.",
    ),
    "S28": Reference(
        REJECT,
        "Concentrating a field force and sponsored events on regions is marketing to health professionals (Art. 54).",
        none_answer,
    ),
    "S29": Reference(
        REJECT,
        "Linking records to an app's user base to target individuals with offers is prohibited (Art. 54).",
        none_answer,
    ),
    "S20": Reference(
        SPE,
        "Algorithm development is an allowed purpose (Art. 53). The model needs patient-level data (Art. 66). Access only inside a secure processing environment (Art. 68, 73).",
        s20,
    ),
}


def build_expected() -> dict[str, dict]:
    expected = {}
    for request_id, ref in REFERENCES.items():
        decision, articles = ref.decision
        answer = ref.answer() if decision != "REJECT" else None
        entry: dict[str, Any] = {"decision": decision, "articles": articles, "reason": ref.reason, "answer": answer}
        if ref.note:
            entry["note"] = ref.note
        if request_id == "S20":
            entry["spe_rows"] = s20_rows()
        expected[request_id] = entry
    return expected


def main() -> None:
    expected = build_expected()
    (HERE / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {HERE / 'expected.json'} ({len(expected)} requests)")
    print(json.dumps(ideal_values(), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
