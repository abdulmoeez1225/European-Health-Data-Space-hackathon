"""Result of processing one request: what applicants, staff and the eval see."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from backend.plan import QueryPlan

DecisionCode = Literal["REJECT", "APPROVE_STATISTICAL", "APPROVE_SPE"]

_TRAILING_TAGS = re.compile(r"(\s*</?[A-Za-z_][\w:-]*>)+\s*$")

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

    @field_validator("justification", "explanation_for_applicant")
    @classmethod
    def _drop_trailing_markup(cls, text: str) -> str:
        """The CLI model sometimes ends a field with its tool-call closing tags; applicants must not see them."""
        return _TRAILING_TAGS.sub("", text).strip()


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
    metric_labels: dict[str, str] = Field(
        default_factory=dict, description="Metric name -> heading in the request's own words."
    )
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


# awaiting_permit: records were approved and the secure workspace is prepared, but it stays locked until
# staff issue the data permit (Art. 68).
DecisionStatus = Literal["awaiting_permit", "issued", "withdrawn", "reopened"]
StaffActionKind = Literal["permit_issued", "withdrawn", "reopened"]


class StaffAction(BaseModel):
    """What access-body staff did with a decision.

    permit_issued: staff signed off the data permit; the secure workspace opens for the applicant.
    withdrawn: a grant was taken back; released statistics and the secure workspace were pulled.
    reopened: a refusal was set aside; staff reconsider the case manually.
    """

    kind: StaffActionKind
    reason: str
    at: datetime
    released_data_withdrawn: bool = False


class StaffActionRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _reason_not_blank(self) -> StaffActionRequest:
        if not self.reason.strip():
            raise ValueError("a reason is required")
        return self


class AppealRequest(StaffActionRequest):
    """The applicant's reason for contesting a refusal."""


class Appeal(BaseModel):
    reason: str
    at: datetime


class Consensus(BaseModel):
    """How many independent AI readings of the request agreed with the released outcome."""

    assessment_votes: int = 0
    assessment_agreeing: int = 0
    plan_votes: int = 0
    plan_agreeing: int = 0


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
    consensus: Consensus = Field(default_factory=Consensus)
    status: DecisionStatus = "issued"
    staff_action: StaffAction | None = None
    appeal: Appeal | None = None
    timings: Timings = Field(default_factory=Timings)
    processed_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def needs_attention(self) -> bool:
        """Staff should look at it: a permit to sign off, an issued decision with review flags, or an open appeal."""
        if self.status == "awaiting_permit":
            return True
        return self.status == "issued" and (bool(self.review_flags) or self.appeal is not None)
