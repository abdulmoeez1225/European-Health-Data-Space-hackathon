"""Result of processing one request: what applicants, staff and the eval see."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.plan import QueryPlan

DecisionCode = Literal["REJECT", "APPROVE_STATISTICAL", "APPROVE_SPE"]

ProhibitedGround = Literal[
    "none",
    "detrimental_decisions",
    "employment_or_insurance_or_credit",
    "advertising_or_marketing",
    "harmful_products",
    "other_unlawful_or_unethical",
]

AllowedPurpose = Literal[
    "public_interest_public_health",
    "policy_making_and_regulation",
    "official_statistics",
    "education_and_teaching",
    "scientific_research",
    "product_and_algorithm_development",
    "improving_care",
    "none",
]


class PurposeAssessment(BaseModel):
    """Judgement of the request text. Produced by the LLM, checked by rules."""

    prohibited: bool
    prohibited_ground: ProhibitedGround
    allowed_purpose: AllowedPurpose
    records_justified: bool = Field(description="Applicant explains why statistics are not enough.")
    justification: str = Field(description="Short quote or paraphrase from the request supporting the judgement.")
    explanation_for_applicant: str = Field(description="Two or three plain-language sentences for the applicant.")


class ReviewFlag(BaseModel):
    reason: str


class ReleasedCell(BaseModel):
    metric: str
    kind: str
    shown: int | float | str
    suppressed_by: str | None = None


class ReleasedRow(BaseModel):
    labels: dict[str, str]
    cells: list[ReleasedCell]


class PrivacyCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class StatisticsOutput(BaseModel):
    dimensions: list[str]
    rows: list[ReleasedRow]
    answer: dict[str, Any]
    sql: str
    privacy_checks: list[PrivacyCheck]


class SpeOutput(BaseModel):
    permit_id: str
    cohort_size: int
    tables: dict[str, int] = Field(description="Table name -> rows copied.")
    download_blocked: bool = True


class CodeMapping(BaseModel):
    system: Literal["ICD-10", "ATC", "LOINC"]
    prefix: str
    matched: list[str] = Field(description="'CODE label' entries present in the data.")


class Timings(BaseModel):
    llm_s: float = 0.0
    compute_s: float = 0.0
    total_s: float = 0.0


class RequestResult(BaseModel):
    request_id: str
    request: dict[str, Any]
    decision: DecisionCode
    articles: list[str]
    reason: str = Field(description="Plain-language reason shown to the applicant.")
    legal_basis: list[str] = Field(description="One line per cited article explaining why it applies.")
    assessment: PurposeAssessment
    review_flags: list[ReviewFlag] = Field(default_factory=list)
    plan: QueryPlan | None = None
    code_mappings: list[CodeMapping] = Field(default_factory=list)
    statistics: StatisticsOutput | None = None
    spe: SpeOutput | None = None
    llm_backend: str
    cached: bool = False
    timings: Timings = Field(default_factory=Timings)
    processed_at: datetime
