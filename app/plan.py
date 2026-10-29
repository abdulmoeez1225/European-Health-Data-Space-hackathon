"""Query plan: the only thing the LLM produces for computing numbers.

The LLM translates the plain-English definitions of a request into this
structure. The compiler turns it into SQL; the LLM never writes SQL and
never sees patient data.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

Code = Annotated[str, Field(pattern=r"^[A-Za-z0-9.\-]{1,12}$")]
Name = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]

Region = Literal[
    "Burgenland", "Kärnten", "Niederösterreich", "Oberösterreich", "Salzburg",
    "Steiermark", "Tirol", "Vorarlberg", "Wien",
]
DataHolder = Literal["Klinikum Nord", "Klinikum Süd", "Klinikum West"]
EncounterType = Literal["inpatient", "outpatient", "emergency"]
Comparator = Literal["<", "<=", ">", ">=", "="]


class _Criterion(BaseModel):
    negate: bool = Field(default=False, description="True = the patient must NOT meet this criterion.")


class AgeCriterion(_Criterion):
    """Age on the reference date (2025 minus birth year), bounds inclusive."""

    kind: Literal["age"] = "age"
    min_age: int | None = None
    max_age: int | None = None


class SexCriterion(_Criterion):
    kind: Literal["sex"] = "sex"
    sex: Literal["female", "male"]


class RegionCriterion(_Criterion):
    kind: Literal["region"] = "region"
    regions: list[Region] = Field(min_length=1)


class DataHolderCriterion(_Criterion):
    kind: Literal["data_holder"] = "data_holder"
    data_holders: list[DataHolder] = Field(min_length=1)


class ConditionCriterion(_Criterion):
    """Patient has at least one diagnosis row whose ICD-10 code starts with a prefix."""

    kind: Literal["condition"] = "condition"
    icd10_prefixes: list[Code] = Field(min_length=1)
    onset_from: date | None = None
    onset_to: date | None = None


class MedicationCriterion(_Criterion):
    """Patient has a prescription whose ATC code starts with a prefix.

    `active_on` restricts to prescriptions active on that day:
    start_date <= day and (end_date empty or end_date >= day).
    `overlaps_from`/`overlaps_to` restrict to prescriptions taken at any time in that period
    ("on metformin at any time in 2024"); `started_from`/`started_to` to prescriptions started in it.
    """

    kind: Literal["medication"] = "medication"
    atc_prefixes: list[Code] = Field(min_length=1)
    active_on: date | None = None
    started_from: date | None = None
    started_to: date | None = None
    overlaps_from: date | None = None
    overlaps_to: date | None = None


class ObservationCriterion(_Criterion):
    """Patient has a measurement for the LOINC code.

    With `comparator` and `value`, the patient's latest value must satisfy it.
    """

    kind: Literal["observation"] = "observation"
    loinc: Code
    comparator: Comparator | None = None
    value: float | None = None
    date_from: date | None = None
    date_to: date | None = None

    @model_validator(mode="after")
    def _threshold_is_complete(self) -> ObservationCriterion:
        if (self.comparator is None) != (self.value is None):
            raise ValueError("comparator and value must be given together")
        return self


class EncounterCriterion(_Criterion):
    """An encounter matching all given fields.

    With unit "patients": the patient has at least `min_count` such encounters.
    With unit "encounters": the counted stay itself matches (use it in a metric's `where` to count,
    for example, only heart-failure stays among all inpatient stays).
    """

    kind: Literal["encounter"] = "encounter"
    types: list[EncounterType] | None = None
    primary_icd10_prefixes: list[Code] | None = None
    start_from: date | None = None
    start_to: date | None = None
    min_count: int = 1


Criterion = Annotated[
    AgeCriterion
    | SexCriterion
    | RegionCriterion
    | DataHolderCriterion
    | ConditionCriterion
    | MedicationCriterion
    | ObservationCriterion
    | EncounterCriterion,
    Field(discriminator="kind"),
]


class EncounterFilter(BaseModel):
    """Which encounters are counted when the unit is encounters (stays/visits)."""

    types: list[EncounterType] | None = None
    primary_icd10_prefixes: list[Code] | None = None
    start_from: date | None = None
    start_to: date | None = None


class AgeBand(BaseModel):
    label: str
    min_age: int
    max_age: int | None = None


class GroupBy(BaseModel):
    dimension: Literal["region", "data_holder", "sex", "age_band", "encounter_type", "start_year"]
    age_bands: list[AgeBand] | None = None

    @model_validator(mode="after")
    def _bands_for_age(self) -> GroupBy:
        if self.dimension == "age_band" and not self.age_bands:
            raise ValueError("age_band grouping needs age_bands")
        return self


class CountMetric(BaseModel):
    """Number of units (patients or encounters) in the group that meet `where`."""

    kind: Literal["count"] = "count"
    name: Name
    where: list[Criterion] = Field(default_factory=list)
    distinct_patients: bool = False


class PercentMetric(BaseModel):
    """numerator / denominator x 100.

    Denominator = units in the group meeting `denominator_where` (all units if empty).
    Numerator = denominator units that also meet `numerator_where`.
    """

    kind: Literal["percent"] = "percent"
    name: Name
    numerator_where: list[Criterion] = Field(min_length=1)
    denominator_where: list[Criterion] = Field(default_factory=list)


class MeanMetric(BaseModel):
    """Mean of each patient's latest (or first) value of a LOINC measurement.

    Only units meeting `where` that have a value are averaged. `date_from`/`date_to` take the
    latest (or first) value within that period. For encounter units, `of` = "length_of_stay_days"
    averages end_date - start_date.
    """

    kind: Literal["mean"] = "mean"
    name: Name
    of: Literal["observation", "length_of_stay_days"] = "observation"
    loinc: Code | None = None
    which: Literal["latest", "first"] = "latest"
    date_from: date | None = None
    date_to: date | None = None
    where: list[Criterion] = Field(default_factory=list)

    @model_validator(mode="after")
    def _loinc_for_observation(self) -> MeanMetric:
        if self.of == "observation" and not self.loinc:
            raise ValueError("observation mean needs loinc")
        return self


Metric = Annotated[CountMetric | PercentMetric | MeanMetric, Field(discriminator="kind")]


class RecordSelection(BaseModel):
    """A record type copied into a secure processing environment."""

    table: Literal["patients", "conditions", "medications", "observations", "encounters"]
    codes: list[Code] | None = Field(
        default=None,
        description="Optional code prefixes (ICD-10, ATC or LOINC) to restrict the rows copied.",
    )


class QueryPlan(BaseModel):
    unit: Literal["patients", "encounters"] = "patients"
    cohort: list[Criterion] = Field(default_factory=list, description="All must hold (AND).")
    encounter_filter: EncounterFilter | None = None
    group_by: list[GroupBy] = Field(default_factory=list)
    metrics: list[Metric] = Field(default_factory=list)
    spe_records: list[RecordSelection] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list, description="Assumptions made while reading the definitions.")
    unsupported: str | None = Field(
        default=None,
        description="Set only if a requested number cannot be expressed by this plan (e.g. a median, a rate per "
                    "1,000, grouping by drug or diagnosis code); say what and why. Leave null otherwise.",
    )
