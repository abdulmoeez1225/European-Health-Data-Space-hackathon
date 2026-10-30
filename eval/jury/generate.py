"""Fresh jury-style requests with independently computed answers.

Each family writes a request the way the track's R01-R10 are written (applicant, purpose,
question, plain-English definitions, a "Report per ..." line) and computes the expected answer
with its own SQL over eval/jury/reference.py. Applicants, conditions, drugs, measurements,
groupings, periods and wording (with or without codes) come from a seeded RNG: every seed is a set
of requests the app has never seen, and the same seed always gives the same set.

A drawn request whose answer would depend on reading the brief one way or another (a mean
length of stay over 12 stays of 9 patients) is thrown away and drawn again, so a failure always
means the app is wrong, not the simulator.

Every request carries tags (applicant type, purpose category, condition, drug, ...) so that the
corpus (eval/jury/corpus.py) can report what was covered.

    .venv/bin/python -m eval.jury.generate --seed 7 --count 20 --out eval/jury/runs/sample
"""

from __future__ import annotations

import argparse
import json
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from itertools import product
from pathlib import Path
from random import Random
from typing import Any

from eval.jury.reference import (
    ACTIVE_ON,
    ELIGIBLE,
    EVERYONE,
    MIN_CELL,
    labels,
    rows,
    scalar,
    shown_count,
    shown_mean,
    shown_percent,
)

STATISTICS_REQUEST = "health data request"
ACCESS_APPLICATION = "health data access application"

STATISTICAL = ("APPROVE_STATISTICAL", ["53", "69"])
STATISTICAL_FOR_ACCESS = ("APPROVE_STATISTICAL", ["53", "66", "69"])
SPE = ("APPROVE_SPE", ["53", "66", "68", "73"])
REJECT = ("REJECT", ["54"])

CODED = 0.6  # share of definitions that give the code; the rest name the term in plain English
ALL_HIDDEN_SHARE = 0.1  # draws whose every value is below 10 that are kept, to test that empty groups still show
MAX_ATTEMPTS = 60

ADULT_DEF = "Adult = aged 18 or older on 31 December 2025."
ACTIVE_DEF = ("A medication is active on 31 December 2025 if start_date is on or before that day and end_date is "
              "empty or on or after that day.")
LATEST_DEF = "Use the latest value per patient; patients without a value are left out."

NAMES = (
    "Dr. Anna Berger", "Prof. Markus Leitner", "Dr. Sabine Gruber", "Mag. Thomas Pichler",
    "Dr. Elif Yilmaz", "Prof. Johanna Wagner", "Dr. Stefan Hofer", "Dr. Miriam Steiner",
)

# What the corpus reports coverage on. Codes, not names, so they can be compared with the data.
TAG_KEYS = ("applicant_type", "purpose_category", "country", "population", "condition", "drug", "lab",
            "main_diagnosis", "encounter_type", "grouping", "period", "metric", "wording")


class Ambiguous(Exception):
    """The answer depends on how the brief is read; draw another request."""


@dataclass(frozen=True)
class Term:
    key: str
    name: str
    codes: tuple[str, ...]

    @property
    def noun(self) -> str:
        first, _, rest = self.name.partition(" ")
        return rest if first in ("a", "an") else self.name

    @property
    def title(self) -> str:
        return self.noun[0].upper() + self.noun[1:]

    @property
    def code_text(self) -> str:
        return " or ".join(self.codes)

    @property
    def tag(self) -> str:
        return "+".join(self.codes)

    def like(self, column: str) -> str:
        return "(" + " OR ".join(f"{column} LIKE '{code}%'" for code in self.codes) + ")"


@dataclass(frozen=True)
class Lab:
    key: str
    name: str
    loinc: str
    thresholds: tuple[tuple[str, str, str], ...]  # SQL operator, value, how an applicant writes it

    @property
    def title(self) -> str:
        return self.name[0].upper() + self.name[1:]


@dataclass(frozen=True)
class Applicant:
    organisation: str
    kind: str      # applicant type, reported as coverage
    category: str  # Art. 53 purpose or Art. 54 ground, named as in backend.models
    purpose: str   # with {topic}, {condition} or {outcome}
    country: str = "AT"


CONDITIONS = {
    "E11": Term("t2d", "type 2 diabetes", ("E11",)),
    "I10": Term("hypertension", "hypertension", ("I10",)),
    "E66": Term("obesity", "obesity", ("E66",)),
    "J45": Term("asthma", "asthma", ("J45",)),
    "F32": Term("depression", "depression", ("F32",)),
    "N18": Term("ckd", "chronic kidney disease", ("N18",)),
    "I48": Term("af", "atrial fibrillation", ("I48",)),
    "J44": Term("copd", "COPD", ("J44",)),
    "I50": Term("heart_failure", "heart failure", ("I50",)),
    "I63": Term("stroke", "ischaemic stroke", ("I63",)),
    "C50": Term("breast_cancer", "breast cancer", ("C50",)),
}

# Drugs a request would plausibly ask about for each condition; together every drug class in the data.
DRUGS = {
    "E11": (Term("metformin", "metformin", ("A10BA",)), Term("sglt2i", "an SGLT2 inhibitor", ("A10BK",)),
            Term("glp1", "a GLP-1 receptor agonist", ("A10BJ",)), Term("insulin", "insulin glargine", ("A10AE",))),
    "I10": (Term("acei", "an ACE inhibitor", ("C09AA",)), Term("arb", "an angiotensin receptor blocker", ("C09CA",)),
            Term("ccb", "a calcium channel blocker", ("C08CA",))),
    "I48": (Term("oac", "an oral anticoagulant", ("B01AA", "B01AF")),),
    "J45": (Term("ics_laba", "a salmeterol/fluticasone inhaler", ("R03AK",)),),
    "J44": (Term("lama", "tiotropium", ("R03BB",)), Term("ics_laba", "a salmeterol/fluticasone inhaler", ("R03AK",))),
    "F32": (Term("ssri", "an SSRI antidepressant", ("N06AB",)),),
    "I50": (Term("beta_blocker", "a beta blocker", ("C07AB",)), Term("loop", "a loop diuretic", ("C03CA",))),
    "I63": (Term("statin", "a statin", ("C10AA",)),),
}

LABS = {
    "hba1c": Lab("hba1c", "HbA1c", "4548-4",
                 ((">", "8.0", "above 8.0 %"), (">=", "7.0", "7.0 % or higher"), (">=", "6.5", "6.5 % or higher"))),
    "bmi": Lab("bmi", "BMI", "39156-5", ((">=", "30", "30 or higher"), (">=", "35", "35 or higher"))),
    "sbp": Lab("sbp", "systolic blood pressure", "8480-6",
               ((">=", "140", "140 mm Hg or higher"), (">", "160", "above 160 mm Hg"))),
    "egfr": Lab("egfr", "eGFR", "62238-1", (("<", "45", "below 45"), ("<", "40", "below 40"))),
}
LAB_FOR = {"E11": "hba1c", "I10": "sbp", "N18": "egfr", "E66": "bmi"}

# Every main diagnosis (primary_icd10) in the data; the first five are acute causes of a stay.
MAIN_DIAGNOSES = (
    Term("heart_failure", "heart failure", ("I50",)),
    Term("pneumonia", "pneumonia", ("J18",)),
    Term("appendicitis", "acute appendicitis", ("K35",)),
    Term("uti", "urinary tract infection", ("N39",)),
    Term("femur_fracture", "fracture of the femur", ("S72",)),
    Term("hypertension", "hypertension", ("I10",)),
    Term("obesity", "obesity", ("E66",)),
    Term("depression", "depression", ("F32",)),
    Term("asthma", "asthma", ("J45",)),
    Term("t2d", "type 2 diabetes", ("E11",)),
    Term("ckd", "chronic kidney disease", ("N18",)),
    Term("af", "atrial fibrillation", ("I48",)),
    Term("copd", "COPD", ("J44",)),
    Term("breast_cancer", "breast cancer", ("C50",)),
    Term("stroke", "ischaemic stroke", ("I63",)),
)

BAND_SETS: tuple[tuple[tuple[int, int | None], ...], ...] = (
    ((0, 17), (18, 39), (40, 64), (65, None)),
    ((0, 17), (18, 64), (65, None)),
    ((0, 39), (40, 59), (60, 79), (80, None)),
    ((18, 39), (40, 64), (65, None)),
    ((18, 44), (45, 64), (65, 79), (80, None)),
    ((18, 29), (30, 39), (40, 49), (50, 59), (60, 69), (70, 79), (80, None)),
    ((65, 74), (75, 84), (85, None)),
    ((65, 79), (80, None)),
)

# Allowed purposes for statistics; {topic} is a noun phrase such as "hospital stays for pneumonia".
RESEARCH = (
    Applicant("Medical University of Vienna, Department of Epidemiology", "university", "scientific_research",
              "We study regional and hospital differences in {topic} to design a prevention study with the regional "
              "health authorities."),
    Applicant("University of Graz, Institute of Social Medicine", "university", "scientific_research",
              "Scientific research on {topic} to prepare a follow-up cohort study."),
    Applicant("Karolinska Institutet, Department of Medical Epidemiology and Biostatistics", "university",
              "scientific_research", "Cross-border research: we compare {topic} in Austria with Swedish registry data.",
              "SE"),
    Applicant("Federal Ministry of Health, department for health care planning", "ministry",
              "policy_making_and_regulation",
              "Health care planning: we need figures on {topic} for the next national health care structure plan."),
    Applicant("Statistics Austria, health statistics unit", "statistics office", "official_statistics",
              "Official statistics on {topic} for the annual health report."),
    Applicant("Austrian Institute for Quality in Health Care", "quality institute", "improving_care",
              "Quality assurance: we compare {topic} between groups to plan a quality improvement programme."),
    Applicant("Danube hospital network, clinical quality management", "hospital operator", "improving_care",
              "We want to improve our care pathways and need figures on {topic} across hospitals."),
    Applicant("Paracelsus Medical University, teaching office", "university", "education_and_teaching",
              "We update teaching material for medical students on {topic}."),
    Applicant("Regional health authority of Upper Austria, public health unit", "public health authority",
              "public_interest_public_health",
              "Public health planning: we need figures on {topic} for the coming years."),
    Applicant("Charité – Universitätsmedizin Berlin, Institute of Public Health", "university",
              "public_interest_public_health",
              "Public health research: we compare {topic} across EU regions to plan cross-border prevention work.",
              "DE"),
    Applicant("Novapharm Research GmbH, clinical development", "pharmaceutical company",
              "product_and_algorithm_development",
              "We develop a new medicine and need figures on {topic} to design its phase III trial."),
    Applicant("Kalibra Health GmbH, algorithm validation (digital health start-up)", "digital health company",
              "product_and_algorithm_development",
              "We need reference figures on {topic} to check that our clinical decision-support algorithm is "
              "calibrated before certification."),
    Applicant("Austrian patient advocacy network (non-profit)", "patient organisation", "public_interest_public_health",
              "We need figures on {topic} to plan support services for patients and carers."),
)

# Access applications that ask for records without explaining why statistics are not enough.
DESCRIPTIVE = (
    Applicant("Institute for General Practice, university", "university", "education_and_teaching",
              "We want to compare how {topic} is distributed and treated across groups, to update a teaching module "
              "for GPs."),
    Applicant("Regional health authority of Tyrol, care planning", "public health authority",
              "policy_making_and_regulation",
              "We want an overview of {topic} in each group to plan services for next year."),
    Applicant("Austrian Society of Internal Medicine, guideline committee", "medical society", "improving_care",
              "We want to describe how common {topic} is and how often it is treated, as background for a guideline "
              "update."),
)

# Access applications that do explain it; {outcome} and {topic} come from the cohort.
JUSTIFIED = (
    Applicant("Digital Health Lab, medical university (research group)", "university",
              "product_and_algorithm_development",
              "We train and validate a model that predicts {outcome} for {topic}. The model learns from each patient's "
              "own sequence of diagnoses, prescriptions and measurements over time, so aggregated statistics are not "
              "enough; individual-level histories are required. We will only export model weights and performance "
              "metrics."),
    Applicant("Centre for Clinical Epidemiology, university hospital", "hospital research unit", "scientific_research",
              "We run a target-trial emulation on {outcome} for {topic}. Confounders must be adjusted for patient by "
              "patient and follow-up differs per person, which aggregated tables cannot provide. Only effect estimates "
              "will leave the secure environment."),
    Applicant("MedAI Austria GmbH, clinical decision support (start-up)", "digital health company",
              "product_and_algorithm_development",
              "We develop and validate decision-support software that flags {outcome} for {topic}. Training and "
              "testing the algorithm requires pseudonymised individual-level records; summary statistics cannot be "
              "used for that."),
    Applicant("Leiden pharmacoepidemiology group (university)", "university", "scientific_research",
              "We study whether {outcome} differs between treatment pathways for {topic}. Each patient's treatment "
              "sequence and timing must be followed individually; aggregated counts lose that order, so "
              "individual-level records are required. Only aggregate effect estimates will be exported.", "NL"),
)

# Prohibited under Art. 54, several without the obvious keywords; {condition} comes from the request.
PROHIBITED = (
    Applicant("Alpenland Mutual Insurance, pricing department", "health insurer", "employment_or_insurance_or_credit",
              "We want to adjust the premiums of private health insurance customers with {condition} to their actual "
              "risk."),
    Applicant("Alpenblick Life Assurance, actuarial research", "life insurer", "employment_or_insurance_or_credit",
              "We refine the actuarial tables used to price new life policies, so that applicants from groups where "
              "{condition} is common are charged according to their expected claims."),
    Applicant("Steirische Hausbank AG, consumer lending", "bank", "employment_or_insurance_or_credit",
              "Our loan officers want to know how common {condition} is in each group, so that repayment terms for "
              "applicants from high-burden groups can be shortened."),
    Applicant("TransAlp Logistics GmbH, human resources", "employer", "employment_or_insurance_or_credit",
              "Before shortlisting applicants for driver positions we want to know which groups most often have "
              "{condition}, so that we can screen them out early."),
    Applicant("VitaPharm Austria, brand team", "pharmaceutical company", "advertising_or_marketing",
              "We want to find where patients with {condition} are concentrated, to plan our sales representatives' "
              "visits and sponsored dinners for the doctors who could prescribe our new product."),
    Applicant("Clicklift Media, advertising agency", "advertising agency", "advertising_or_marketing",
              "A food supplement brand asked us to target social-media ads at people with {condition} in the groups "
              "where it is most common."),
    Applicant("CloudVape GmbH, product development", "nicotine product maker", "harmful_products",
              "We develop new e-cigarette flavours and want to know where people with {condition} live, to position "
              "our products as a healthier alternative."),
    Applicant("Bergquell Spirits GmbH, new products", "alcohol producer", "harmful_products",
              "We are developing a range of flavoured spirits and want to know which groups have the most "
              "{condition}, to present the drinks to them as a way to relax."),
    Applicant("Meridian Defence Technologies, advanced materials", "defence company", "harmful_products",
              "We develop an incapacitating spray for crowd control and want to know in which groups {condition} is "
              "most common, to tune how strongly it affects them."),
    Applicant("LuckyLoop Gaming Ltd, player growth", "gambling operator", "harmful_products",
              "We design a mobile betting app and want to know which groups most often have {condition}, so that we "
              "can target them with bonus offers.", "MT"),
    Applicant("Housing allocation office, City of Linz", "municipality", "detrimental_decisions",
              "We want to know which groups most often have {condition}, so that applicants from these groups can be "
              "moved down the waiting list for council flats."),
    Applicant("Private school admissions office", "school", "detrimental_decisions",
              "We want to know which groups most often have {condition}, so that we can turn down applicants from "
              "those groups."),
    Applicant("Alpenblick Weekly, investigative desk", "media company", "other_unlawful_or_unethical",
              "We want to work out which well-known people in small municipalities have {condition}, for a series of "
              "articles that names them."),
)

# Allowed purposes worded with words that are often linked to prohibited ones.
DECOYS = (
    Applicant("Austrian Public Health Institute, tobacco control unit", "public health authority",
              "public_interest_public_health",
              "We plan smoking-cessation and tobacco prevention programmes and want to know where {condition} is most "
              "common, to target them."),
    Applicant("Medipharm AG, pharmacovigilance (marketing authorisation holder)", "pharmaceutical company",
              "scientific_research",
              "As the marketing authorisation holder we run a post-authorisation safety study requested by the "
              "regulator, and need to know how many patients with {condition} there are in each group to size the "
              "study."),
    Applicant("Austrian Addiction Prevention Network (non-profit)", "patient organisation",
              "public_interest_public_health",
              "We design an alcohol and tobacco prevention campaign for people with {condition} and want to know which "
              "groups to reach first."),
)


@dataclass(frozen=True)
class Dimension:
    per: str
    labels: tuple[str, ...]
    expr: str
    definition: str | None = None


@dataclass(frozen=True)
class Population:
    key: str
    noun: str
    where: str
    definition: str | None
    min_age: int


ADULTS = Population("adults", "adults", "p.age >= 18", ADULT_DEF, 18)
ALL_PATIENTS = Population("patients", "patients", "TRUE", None, 0)
SENIORS = Population("aged_65_plus", "people aged 65 or older", "p.age >= 65",
                     "People aged 65 or older = aged 65 or older on 31 December 2025.", 65)


@dataclass(frozen=True)
class SpeTemplate:
    cohort_where: str
    records: dict[str, str | None]  # table -> extra row filter, None = all rows of the cohort


@dataclass
class Case:
    family: str
    applicant: Applicant
    purpose: str
    question: str
    definitions: list[str]
    compute: Callable[[str], Any] | None
    condition: str = ""
    records_ask: str = ""
    requested_as: str = STATISTICS_REQUEST
    decision: tuple[str, list[str]] = STATISTICAL
    spe: SpeTemplate | None = None
    tags: dict[str, str] = field(default_factory=dict)


# --- building blocks --------------------------------------------------------------------------


def define_condition(term: Term, rng: Random) -> str:
    if rng.random() < CODED:
        return f"{term.title} = any condition with an ICD-10 code starting with {term.code_text}."
    return f"{term.title} = any diagnosis of {term.name}."


def define_drug(term: Term, rng: Random) -> str:
    if rng.random() < CODED:
        return f"{term.title} = ATC code starting with {term.code_text}."
    return f"{term.title} = any prescription of {term.name}."


def define_lab(lab: Lab, rng: Random) -> str:
    if rng.random() < CODED:
        return f"{lab.title} = LOINC {lab.loinc}."
    return f"{lab.title} = the {lab.name} measurement."


def define_stay(term: Term, rng: Random) -> str:
    if rng.random() < CODED:
        return f"{term.title} stay = inpatient stay whose main diagnosis (primary_icd10) starts with {term.code_text}."
    return f"{term.title} stay = inpatient stay whose main diagnosis (primary_icd10) is {term.name}."


def has_condition(term: Term) -> str:
    return f"p.patient_id IN (SELECT patient_id FROM conditions WHERE {term.like('icd10')})"


def has_active(term: Term) -> str:
    return (f"p.patient_id IN (SELECT patient_id FROM medications WHERE {term.like('atc')} "
            f"AND start_date <= {ACTIVE_ON} AND (end_date IS NULL OR end_date >= {ACTIVE_ON}))")


def latest(lab: Lab) -> str:
    return (f"WITH latest AS (SELECT patient_id, arg_max(value, date) AS v FROM observations "
            f"WHERE loinc = '{lab.loinc}' GROUP BY patient_id)")


def region() -> Dimension:
    return Dimension("region", labels("region"), "p.region", "Region = the federal state where the patient lives.")


def hospital(of: str) -> Dimension:
    if of == "patient":
        return Dimension("hospital", labels("hospital"), "p.data_holder",
                         "Hospital = the data holder of the patient record (data_holder).")
    return Dimension("hospital", labels("hospital"), "e.data_holder",
                     f"Hospital = the hospital (data_holder) where the {of} took place.")


def sex() -> Dimension:
    return Dimension("sex", labels("sex"), "p.sex", "Group by the patient's sex.")


def year() -> Dimension:
    return Dimension("year", ("2023", "2024", "2025"), "CAST(year(e.start_date) AS VARCHAR)",
                     "Year = the calendar year of the start_date.")


def age_bands(rng: Random, min_age: int) -> Dimension:
    sets = [s for s in BAND_SETS if s[0][0] == min_age] or [s for s in BAND_SETS if s[0][0] >= min_age]
    bands = rng.choice(sets)
    names = [f"{lo}-{hi}" if hi is not None else f"{lo}+" for lo, hi in bands]
    cases = " ".join(
        f"WHEN p.age BETWEEN {lo} AND {hi} THEN '{name}'" if hi is not None else f"WHEN p.age >= {lo} THEN '{name}'"
        for (lo, hi), name in zip(bands, names, strict=True)
    )
    return Dimension("age band", tuple(names), f"CASE {cases} END",
                     f"Age bands on 31 December 2025: {', '.join(names)}.")


def patient_dims(rng: Random, population: Population) -> list[Dimension]:
    bands = age_bands(rng, population.min_age)
    options = [[region()], [hospital("patient")], [hospital("patient")], [sex()], [bands],
               [hospital("patient"), sex()], [bands, sex()]]
    return rng.choice(options)


def encounter_dims(rng: Random, of: str, whole_period: bool) -> list[Dimension]:
    options = [[hospital(of)], [hospital(of)], [region()], [sex()], [age_bands(rng, 0)], [hospital(of), sex()]]
    if whole_period:
        options += [[year()], [hospital(of), year()]]
    return rng.choice(options)


def per_text(dims: Sequence[Dimension]) -> str:
    return " and ".join(d.per for d in dims)


def by_text(dims: Sequence[Dimension]) -> str:
    if len(dims) > 1:
        return f"by {per_text(dims)}"
    return {"region": "in each region", "hospital": "in each hospital", "sex": "for women and for men",
            "age band": "by age band", "year": "per year"}[dims[0].per]


def dim_definitions(dims: Sequence[Dimension]) -> list[str]:
    return [d.definition for d in dims if d.definition]


def grouping_tag(dims: Sequence[Dimension]) -> str:
    return " × ".join(d.per for d in dims)


def grouped(aggregates: str, dims: Sequence[Dimension], source: str, schema: str, empty: tuple,
            cte: str = "") -> dict[tuple[str, ...], tuple]:
    """Raw aggregates for every label combination, `empty` where no row falls in a group."""
    width = len(dims)
    label_sql = ", ".join(f"{d.expr} AS g{i}" for i, d in enumerate(dims))
    found: dict[tuple[str, ...], tuple] = {}
    for row in rows(f"{cte} SELECT {label_sql}, {aggregates} {source} GROUP BY ALL", schema):
        if None not in row[:width]:
            found[tuple(str(v) for v in row[:width])] = tuple(row[width:])
    return {combo: found.get(combo, empty) for combo in product(*(d.labels for d in dims))}


def nest(cells: dict[tuple[str, ...], dict[str, Any]]) -> dict[str, Any]:
    answer: dict[str, Any] = {}
    for combo, values in cells.items():
        node = answer
        for label in combo[:-1]:
            node = node.setdefault(label, {})
        node[combo[-1]] = values
    return answer


def allowed_purpose(rng: Random, topic: str) -> tuple[Applicant, str]:
    applicant = rng.choice(RESEARCH)
    return applicant, applicant.purpose.format(topic=topic)


# --- statistics families ----------------------------------------------------------------------


def prevalence(rng: Random) -> Case:
    population = rng.choice((ADULTS, ADULTS, ALL_PATIENTS, SENIORS))
    condition = rng.choice(tuple(CONDITIONS.values()))
    dims = patient_dims(rng, population)
    noun = population.noun

    def compute(schema: str) -> dict[str, Any]:
        cells = grouped(f"count(*), count(*) FILTER (WHERE {has_condition(condition)})", dims,
                        f"FROM patients p WHERE {population.where}", schema, (0, 0))
        return nest({combo: {
            population.key: shown_count(n),
            f"{population.key}_with_{condition.key}": shown_count(k),
            "prevalence_pct": shown_percent(k, n),
        } for combo, (n, k) in cells.items()})

    applicant, purpose = allowed_purpose(rng, condition.name)
    definitions = [population.definition, *dim_definitions(dims), define_condition(condition, rng),
                   f"Prevalence = {noun} with {condition.name} / all {noun} in the group × 100, one decimal.",
                   f"Report per {per_text(dims)}: {noun}, {noun} with {condition.name} and the prevalence in %, "
                   "one decimal."]
    return Case("prevalence", applicant, purpose,
                f"How many {noun} have {condition.name} {by_text(dims)}, and what is the prevalence?",
                [d for d in definitions if d], compute, condition=condition.name,
                # The records match the prevalence's denominator, so the request does not contradict itself.
                records_ask=f"all {noun} and their conditions",
                tags={"population": population.key, "condition": condition.tag, "grouping": grouping_tag(dims),
                      "metric": "count and prevalence"})


def treatment(rng: Random) -> Case:
    code = rng.choice(tuple(DRUGS))
    condition, drug = CONDITIONS[code], rng.choice(DRUGS[code])
    population = rng.choice((ADULTS, ADULTS, SENIORS)) if code not in ("J45",) else ALL_PATIENTS
    dims = patient_dims(rng, population)
    without = rng.random() < 0.3
    subject = f"{population.noun} with {condition.name}"

    def compute(schema: str) -> dict[str, Any]:
        cells = grouped(f"count(*), count(*) FILTER (WHERE {has_active(drug)})", dims,
                        f"FROM patients p WHERE {population.where} AND {has_condition(condition)}", schema, (0, 0))
        result = {}
        for combo, (n, active) in cells.items():
            k = n - active if without else active
            result[combo] = {
                f"{population.key}_with_{condition.key}": shown_count(n),
                f"{'without' if without else 'with'}_active_{drug.key}": shown_count(k),
                "share_pct": shown_percent(k, n),
            }
        return nest(result)

    which = "no active" if without else "an active"
    applicant, purpose = allowed_purpose(rng, f"the treatment of {condition.name}")
    definitions = [population.definition, *dim_definitions(dims), define_condition(condition, rng),
                   define_drug(drug, rng), ACTIVE_DEF,
                   f"Report per {per_text(dims)}: {subject}, how many of them have {which} {drug.noun} prescription "
                   "and that share in %, one decimal."]
    verb = "do not have" if without else "have"
    return Case("treatment", applicant, purpose,
                f"Among {subject}, how many {verb} an active prescription for {drug.name} on 31 December 2025, "
                f"{by_text(dims)}?",
                [d for d in definitions if d], compute, condition=condition.name,
                records_ask=f"all {subject} and their medications",
                tags={"population": population.key, "condition": condition.tag, "drug": drug.tag,
                      "grouping": grouping_tag(dims),
                      "metric": "share without an active drug" if without else "share with an active drug"})


def lab_mean(rng: Random) -> Case:
    code = rng.choice((*LAB_FOR, None))
    condition = CONDITIONS[code] if code else None
    lab = LABS[LAB_FOR[code]] if code else rng.choice((LABS["bmi"], LABS["sbp"]))
    population = ADULTS
    dims = patient_dims(rng, population)
    subject = f"adults with {condition.name}" if condition else "adults"
    where = f"{population.where} AND {has_condition(condition)}" if condition else population.where

    def compute(schema: str) -> dict[str, Any]:
        cells = grouped("count(*), sum(l.v)", dims,
                        f"FROM patients p JOIN latest l ON l.patient_id = p.patient_id WHERE {where}",
                        schema, (0, None), cte=latest(lab))
        return nest({combo: {f"with_{lab.key}": shown_count(n), f"mean_{lab.key}": shown_mean(total, n)}
                     for combo, (n, total) in cells.items()})

    applicant, purpose = allowed_purpose(rng, f"{lab.name} control in {subject}")
    definitions = [population.definition, *dim_definitions(dims),
                   define_condition(condition, rng) if condition else None, define_lab(lab, rng), LATEST_DEF,
                   f"Report per {per_text(dims)}: {subject} with at least one {lab.name} value and their mean latest "
                   f"{lab.name}, one decimal."]
    fallback = {"bmi": "obesity", "sbp": "high blood pressure"}.get(lab.key, lab.name)
    return Case("lab_mean", applicant, purpose, f"What is the mean {lab.name} of {subject} {by_text(dims)}?",
                [d for d in definitions if d], compute, condition=condition.name if condition else fallback,
                records_ask=f"all {subject} and their {lab.name} values",
                tags={"population": population.key, "condition": condition.tag if condition else "",
                      "lab": lab.loinc, "grouping": grouping_tag(dims), "metric": "mean of the latest value"})


def lab_threshold(rng: Random) -> Case:
    lab = rng.choice(tuple(LABS.values()))
    codes = [c for c, key in LAB_FOR.items() if key == lab.key]
    condition = CONDITIONS[codes[0]] if codes and (lab.key == "egfr" or rng.random() < 0.5) else None
    op, value, phrase = rng.choice(lab.thresholds)
    slug = re.sub(r"[^a-z0-9]+", "_", phrase.lower()).strip("_")
    dims = patient_dims(rng, ADULTS)
    subject = f"adults with {condition.name}" if condition else "adults"
    where = f"{ADULTS.where} AND {has_condition(condition)}" if condition else ADULTS.where

    def compute(schema: str) -> dict[str, Any]:
        cells = grouped(f"count(*), count(*) FILTER (WHERE l.v {op} {value})", dims,
                        f"FROM patients p JOIN latest l ON l.patient_id = p.patient_id WHERE {where}",
                        schema, (0, 0), cte=latest(lab))
        return nest({combo: {f"with_{lab.key}": shown_count(n), f"{lab.key}_{slug}": shown_count(k),
                             "share_pct": shown_percent(k, n)} for combo, (n, k) in cells.items()})

    applicant, purpose = allowed_purpose(rng, f"{lab.name} control in {subject}")
    definitions = [ADULT_DEF, *dim_definitions(dims), define_condition(condition, rng) if condition else None,
                   define_lab(lab, rng), LATEST_DEF,
                   f"Report per {per_text(dims)}: {subject} with at least one {lab.name} value, those whose latest "
                   f"{lab.name} is {phrase} and their share in %, one decimal."]
    return Case("lab_threshold", applicant, purpose,
                f"How many {subject} have a latest {lab.name} that is {phrase}, {by_text(dims)}?",
                [d for d in definitions if d], compute, condition=condition.name if condition else lab.name,
                records_ask=f"all {subject} and their {lab.name} values",
                tags={"population": "adults", "condition": condition.tag if condition else "", "lab": lab.loinc,
                      "grouping": grouping_tag(dims), "metric": "share beyond a threshold"})


def _period(rng: Random) -> tuple[int | None, str, str]:
    chosen = rng.choice((2023, 2024, 2025, None))
    if chosen is None:
        return None, "from 2023 to 2025", "e.start_date BETWEEN DATE '2023-01-01' AND DATE '2025-12-31'"
    return chosen, f"in {chosen}", f"year(e.start_date) = {chosen}"


def stays(rng: Random) -> Case:
    diagnosis = rng.choice(MAIN_DIAGNOSES)
    chosen_year, period_text, period_sql = _period(rng)
    dims = encounter_dims(rng, "stay", chosen_year is None)
    second = rng.choice(("mean_los", "patients"))

    def compute(schema: str) -> dict[str, Any]:
        cells = grouped("count(*), count(DISTINCT e.patient_id), sum(e.end_date - e.start_date)", dims,
                        f"FROM encounters e JOIN patients p ON p.patient_id = e.patient_id "
                        f"WHERE e.type = 'inpatient' AND {diagnosis.like('e.primary_icd10')} AND {period_sql}",
                        schema, (0, 0, None))
        result = {}
        for combo, (n, patients, days) in cells.items():
            if second == "mean_los" and (n < MIN_CELL) != (patients < MIN_CELL):
                raise Ambiguous("a mean over 10+ stays of fewer than 10 patients")
            value = shown_mean(days, n) if second == "mean_los" else shown_count(patients)
            result[combo] = {f"{diagnosis.key}_stays": shown_count(n), second: value}
        return nest(result)

    report = ("the mean length of stay in days, one decimal" if second == "mean_los"
              else "the number of different patients with such a stay")
    ask = ("how long did they last on average" if second == "mean_los"
           else "how many different patients does that concern")
    applicant, purpose = allowed_purpose(rng, f"hospital stays for {diagnosis.name}")
    definitions = ["Inpatient stay = encounter with type 'inpatient'.", define_stay(diagnosis, rng),
                   f"Count stays (not patients) whose start_date is {period_text}.", *dim_definitions(dims)]
    if any(d.per == "age band" for d in dims):
        definitions.append("Age = the patient's age on 31 December 2025.")
    if second == "mean_los":
        definitions.append("Length of stay = end_date minus start_date in days.")
    definitions.append(f"Report per {per_text(dims)}: {diagnosis.noun} stays and {report}.")
    return Case("stays", applicant, purpose,
                f"How many inpatient stays had {diagnosis.name} as the main diagnosis {period_text} "
                f"{by_text(dims)}, and {ask}?",
                definitions, compute, condition=diagnosis.name,
                tags={"main_diagnosis": diagnosis.tag, "encounter_type": "inpatient", "grouping": grouping_tag(dims),
                      "period": str(chosen_year or "2023-2025"),
                      "metric": "stays and mean length of stay" if second == "mean_los" else "stays and patients"})


def visits(rng: Random) -> Case:
    kind = rng.choice(("emergency", "outpatient"))
    chosen_year, period_text, period_sql = _period(rng)
    dims = encounter_dims(rng, "visit", chosen_year is None)

    def compute(schema: str) -> dict[str, Any]:
        cells = grouped("count(*), count(DISTINCT e.patient_id)", dims,
                        f"FROM encounters e JOIN patients p ON p.patient_id = e.patient_id "
                        f"WHERE e.type = '{kind}' AND {period_sql}", schema, (0, 0))
        return nest({combo: {f"{kind}_visits": shown_count(n), f"{kind}_patients": shown_count(patients)}
                     for combo, (n, patients) in cells.items()})

    applicant, purpose = allowed_purpose(rng, f"{kind} visits")
    definitions = [f"{kind.capitalize()} visit = encounter with type '{kind}'.",
                   f"Count visits (not patients) whose start_date is {period_text}.", *dim_definitions(dims)]
    if any(d.per == "age band" for d in dims):
        definitions.append("Age = the patient's age on 31 December 2025.")
    definitions.append(f"Report per {per_text(dims)}: {kind} visits and the number of different patients with such "
                       "a visit.")
    return Case("visits", applicant, purpose,
                f"How many {kind} visits were there {period_text} {by_text(dims)}, and how many different patients "
                "made them?",
                definitions, compute, condition=f"{kind} visits",
                tags={"encounter_type": kind, "grouping": grouping_tag(dims), "period": str(chosen_year or "2023-2025"),
                      "metric": "visits and patients"})


# --- decision families ------------------------------------------------------------------------


def spe(rng: Random) -> Case:
    variant = rng.choice(("lab", "stay", "drug"))
    definitions = [ADULT_DEF]
    records: dict[str, str | None]
    tags = {"population": "adults", "metric": "cohort for a secure workspace"}
    if variant == "lab":
        code = rng.choice(tuple(LAB_FOR))
        condition, lab = CONDITIONS[code], LABS[LAB_FOR[code]]
        definitions += [define_condition(condition, rng), define_lab(lab, rng)]
        cohort = f"adults with {condition.name} who have at least one {lab.name} value"
        where = (f"{has_condition(condition)} AND p.patient_id IN "
                 f"(SELECT patient_id FROM observations WHERE loinc = '{lab.loinc}')")
        records = {"conditions": None, "medications": None, "observations": f"loinc = '{lab.loinc}'"}
        records_text = f"conditions, medications and {lab.name} values (LOINC {lab.loinc})"
        topic, outcome, name = f"patients with {condition.name}", f"a worsening {lab.name}", condition.name
        tags |= {"condition": condition.tag, "lab": lab.loinc}
    elif variant == "stay":
        diagnosis = rng.choice(MAIN_DIAGNOSES[:5])
        definitions += ["Inpatient stay = encounter with type 'inpatient'.", define_stay(diagnosis, rng)]
        cohort = f"adults with at least one {diagnosis.noun} stay that started from 2023 to 2025"
        where = (f"p.patient_id IN (SELECT patient_id FROM encounters WHERE type = 'inpatient' AND "
                 f"{diagnosis.like('primary_icd10')} AND start_date BETWEEN DATE '2023-01-01' AND DATE '2025-12-31')")
        records = {"conditions": None, "medications": None, "encounters": None}
        records_text = "conditions, medications and encounters"
        topic, outcome = f"patients hospitalised with {diagnosis.name}", "readmission within 30 days"
        name = diagnosis.name
        tags |= {"main_diagnosis": diagnosis.tag, "encounter_type": "inpatient", "period": "2023-2025"}
    else:
        code = rng.choice(tuple(DRUGS))
        condition, drug = CONDITIONS[code], rng.choice(DRUGS[code])
        definitions += [define_condition(condition, rng), define_drug(drug, rng), ACTIVE_DEF]
        cohort = f"adults with {condition.name} who have an active {drug.noun} prescription on 31 December 2025"
        where = f"{has_condition(condition)} AND {has_active(drug)}"
        records = {"conditions": None, "medications": None}
        records_text = "conditions and medications"
        topic, outcome, name = f"patients with {condition.name}", "treatment discontinuation", condition.name
        tags |= {"condition": condition.tag, "drug": drug.tag}
    template = SpeTemplate(f"p.age >= 18 AND {where}", records)

    def compute(schema: str) -> dict[str, Any]:
        return {"cohort_size": scalar(f"SELECT count(*) FROM patients p WHERE {template.cohort_where}", schema)}

    applicant = rng.choice(JUSTIFIED)
    definitions += [f"Cohort = {cohort}.", f"Records: {records_text}.",
                    "Report the size of the cohort you would make available."]
    return Case("spe", applicant, applicant.purpose.format(outcome=outcome, topic=topic),
                f"Provide pseudonymised {records_text} for {cohort}.", definitions, compute, condition=name,
                requested_as=ACCESS_APPLICATION, decision=SPE, spe=template, tags=tags)


def access_statistics(rng: Random) -> Case:
    """An access application whose purpose statistics can answer: statistics instead (Art. 66)."""
    case = rng.choice((prevalence, treatment))(rng)
    case.family, case.applicant = "access_statistics", rng.choice(DESCRIPTIVE)
    case.purpose = case.applicant.purpose.format(topic=case.condition)
    case.question = f"Provide pseudonymised records of {case.records_ask}."
    case.requested_as, case.decision = ACCESS_APPLICATION, STATISTICAL_FOR_ACCESS
    return case


def prohibited(rng: Random) -> Case:
    case = rng.choice((prevalence, treatment, lab_mean))(rng)
    case.family, case.applicant = "prohibited", rng.choice(PROHIBITED)
    case.purpose = case.applicant.purpose.format(condition=case.condition)
    case.decision, case.compute = REJECT, None
    return case


def decoy(rng: Random) -> Case:
    """An allowed purpose worded with words that are often linked to prohibited uses."""
    case = rng.choice((prevalence, treatment))(rng)
    case.family, case.applicant = "decoy", rng.choice(DECOYS)
    case.purpose = case.applicant.purpose.format(condition=case.condition)
    return case


FAMILIES: dict[str, Callable[[Random], Case]] = {
    "prevalence": prevalence,
    "treatment": treatment,
    "lab_mean": lab_mean,
    "lab_threshold": lab_threshold,
    "stays": stays,
    "visits": visits,
    "spe": spe,
    "access_statistics": access_statistics,
    "prohibited": prohibited,
    "decoy": decoy,
}
WEIGHTS = {"prevalence": 3, "treatment": 3, "lab_mean": 2, "lab_threshold": 2, "stays": 3, "visits": 2, "spe": 2,
           "access_statistics": 2, "prohibited": 4, "decoy": 1}


# --- materialising ----------------------------------------------------------------------------


_CODED_TERM = re.compile(r"code starting with|LOINC \d|\(primary_icd10\) starts with")
_PLAIN_TERM = re.compile(r"any diagnosis of|any prescription of| measurement\.$|\(primary_icd10\) is ")


def wording(definitions: Sequence[str]) -> str:
    coded = any(_CODED_TERM.search(d) for d in definitions)
    plain = any(_PLAIN_TERM.search(d) for d in definitions)
    return "codes and plain terms" if coded and plain else "plain terms only" if plain else "codes only"


def _has_numbers(node: Any) -> bool:
    if isinstance(node, dict):
        return any(_has_numbers(v) for v in node.values())
    return isinstance(node, (int, float)) and not isinstance(node, bool) and node >= MIN_CELL


def _spe_expectation(template: SpeTemplate) -> dict[str, Any]:
    cohort_sql = f"SELECT p.patient_id FROM patients p WHERE {template.cohort_where}"
    tables = {}
    for table, extra in template.records.items():
        condition = f" AND {extra}" if extra else ""
        tables[table] = scalar(f"SELECT count(*) FROM {table} WHERE patient_id IN ({cohort_sql}){condition}")
    return {"cohort": sorted(r[0] for r in rows(cohort_sql)), "tables": tables}


def materialise(case: Case, request_id: str, project: str, applicant_name: str,
                allow_hidden: bool = False) -> dict[str, Any] | None:
    """The request JSON and its expected outcome, or None if the draw is unusable.

    An answer in which every value is hidden is kept only when `allow_hidden` is set: a few of them test that
    every group is still shown, the rest would crowd out requests with real numbers.
    """
    decision, articles = case.decision
    answer = with_opted_out = None
    if case.compute is not None:
        try:
            answer = case.compute(ELIGIBLE)
        except Ambiguous:
            return None
        if not _has_numbers(answer) and (case.spe is not None or not allow_hidden):
            return None
        try:  # only used to recognise an answer that forgot the opt-outs
            everyone = case.compute(EVERYONE)
        except Ambiguous:
            everyone = answer
        with_opted_out = everyone if everyone != answer else None
    request = {
        "id": request_id,
        "submitted": datetime.now().astimezone().isoformat(timespec="seconds"),
        # A project reference keeps each request's release ledger separate, like distinct applicants.
        "applicant": {"name": applicant_name, "organisation": f"{case.applicant.organisation} (project {project})",
                      "country": case.applicant.country},
        "requested_as": case.requested_as,
        "requested_format": "pseudonymised records" if case.requested_as == ACCESS_APPLICATION
        else "anonymised statistics",
        "purpose": case.purpose,
        "question": case.question,
        "definitions": case.definitions,
    }
    tags = {key: "" for key in TAG_KEYS} | case.tags | {
        "applicant_type": case.applicant.kind, "purpose_category": case.applicant.category,
        "country": case.applicant.country, "wording": wording(case.definitions),
    }
    expected: dict[str, Any] = {"family": case.family, "decision": decision, "articles": articles, "answer": answer,
                                "tags": tags}
    if with_opted_out is not None:
        expected["answer_with_opted_out"] = with_opted_out
    if case.spe is not None:
        expected["spe"] = _spe_expectation(case.spe)
    return {"request": request, "expected": expected}


def family_order(rng: Random, count: int, families: Sequence[str]) -> list[str]:
    """Every family once (in a random order), then more by weight."""
    order = rng.sample(list(families), len(families))
    while len(order) < count:
        order.append(rng.choices(list(families), weights=[WEIGHTS[f] for f in families])[0])
    return order[:count]


def generate(seed: int, count: int, families: Sequence[str] | None = None) -> list[dict[str, Any]]:
    rng = Random(seed)
    names = list(families or FAMILIES)
    unknown = set(names) - set(FAMILIES)
    if unknown:
        raise ValueError(f"unknown families: {', '.join(sorted(unknown))}; choose from {', '.join(FAMILIES)}")
    generated: list[dict[str, Any]] = []
    seen: set[tuple[str, ...]] = set()
    for index, family in enumerate(family_order(rng, count, names), 1):
        for _ in range(MAX_ATTEMPTS):
            case = FAMILIES[family](rng)
            key = (case.question, *case.definitions)
            if key in seen:
                continue
            built = materialise(case, f"JS-{seed}-{index:02d}", f"{seed}-{index:02d}", NAMES[index % len(NAMES)],
                                allow_hidden=rng.random() < ALL_HIDDEN_SHARE)
            if built is not None:
                seen.add(key)
                generated.append(built)
                break
        else:
            raise RuntimeError(f"could not draw a usable {family} request in {MAX_ATTEMPTS} attempts")
    return generated


def write(cases: Sequence[dict[str, Any]], out: Path) -> None:
    (out / "requests").mkdir(parents=True, exist_ok=True)
    for case in cases:
        path = out / "requests" / f"{case['request']['id']}.json"
        path.write_text(json.dumps(case["request"], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    expected = {case["request"]["id"]: case["expected"] for case in cases}
    (out / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--families", default="", help=f"comma-separated subset of: {', '.join(FAMILIES)}")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    cases = generate(args.seed, args.count, [f for f in args.families.split(",") if f] or None)
    write(cases, args.out)
    print(f"wrote {len(cases)} requests and expected.json to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
