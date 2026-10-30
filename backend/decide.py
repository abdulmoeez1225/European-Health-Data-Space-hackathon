"""Decide a request: purpose assessment (LLM, checked by rules) and the decision ladder.

Ladder, in order:
1. Prohibited purpose                                  -> REJECT               Art. 54
2. Health data request (statistics)                    -> APPROVE_STATISTICAL  Art. 53, 69
3. Access application explaining why statistics fail   -> APPROVE_SPE          Art. 53, 66, 68, 73
4. Any other access application                        -> APPROVE_STATISTICAL  Art. 53, 66, 69
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from backend.law import ARTICLES
from backend.models import AllowedPurpose, DecisionCode, ProhibitedGround, PurposeAssessment, ReviewFlag

ASSESSMENT_SYSTEM = """You assess applications to a national Health Data Access Body under the European Health \
Data Space Regulation (EU) 2025/327, Chapter IV. You read only the application text; you never see patient data.

Art. 53 allowed purposes: public interest in public or occupational health; policy-making and regulatory \
activities; official statistics; education or teaching in health or care; scientific research related to health \
or care, including development and innovation of products, services, algorithms and AI systems; improving the \
delivery of care and treatment.

Art. 54 prohibited purposes (judge the INTENDED USE of the results, including what the applicant will do with them \
afterwards, not the applicant's identity):
- detrimental_decisions: decisions with negative legal, social or economic effect on individuals or groups, \
including re-identifying people or matching data against the applicant's own lists of people.
- employment_or_insurance_or_credit: decisions about job offers, employment terms or contracts; excluding people \
from insurance or credit, or setting/modifying insurance premiums, contributions or credit conditions.
- advertising_or_marketing: advertising or marketing towards health professionals, organisations or individuals.
- harmful_products: developing or promoting products or services that harm individuals or society, such as \
illicit drugs, alcoholic beverages, tobacco and nicotine products, weaponry, or products designed to create \
addiction or breach public order.
- other_unlawful_or_unethical: other uses contrary to ethics or law.

records_justified: true ONLY if the application explains why anonymised statistics are not enough for the purpose \
(for example training or validating a prediction model on individual-level histories). If the stated purpose or \
question could be answered with aggregate counts, percentages or means per group, it is false even if records \
were requested. For a "health data request" (statistics) it is always false.

allowed_purpose: "none" if the text states no purpose that fits Art. 53 (for example it is empty, meaningless or \
only repeats the question).

explanation_for_applicant: two or three short, plain-language sentences addressed to the applicant ("you"): name \
the purpose, say whether it is allowed and what the applicant receives. A health data request, or an access \
application that does not justify records, receives anonymised statistics per group: say only that; for these \
the words "records", "individual" and "patient-level" must not appear (not even "rather than records"). A justified access application \
receives pseudonymised records inside the secure processing environment once the data permit is issued. If the \
purpose is allowed, never invite the applicant to explain more, resubmit or change the request. No legal jargon \
beyond article numbers. Write it in the language the application is written in (German application, German \
explanation)."""

_KEYWORDS: dict[ProhibitedGround, list[str]] = {
    "employment_or_insurance_or_credit": [
        r"\bpremiums?\b", r"underwrit", r"creditworth", r"credit (score|scoring|limit|decision|condition)",
        r"\bloan", r"\bemployees?\b", r"\bhiring\b", r"recruit", r"renew(ing)? contracts", r"job offer",
        r"pr(ä|ae)mie", r"versicherungstarif", r"bonit(ä|ae)t", r"kredit", r"mitarbeiter", r"arbeitnehmer",
        r"bewerber", r"vertragsverl(ä|ae)ngerung",
    ],
    "advertising_or_marketing": [
        r"advertis", r"marketing", r"promotional campaign", r"sales (target|campaign)", r"werbung", r"werbekampagne",
    ],
    "harmful_products": [
        r"nicotine", r"tobacco", r"cigarette", r"\bvap(e|ing)\b", r"alcoholic", r"weapon", r"gambling",
        r"crowd[- ]control", r"riot control", r"irritant", r"chemical agent", r"military",
        r"defen[cs]e (technolog|industr|contractor)",
        r"nikotin", r"tabak", r"zigarette", r"alkoholische", r"waffe", r"glücksspiel",
    ],
    "detrimental_decisions": [
        r"re-?identif", r"match(ing)? (the )?records with", r"employee list", r"customer list",
        r"mitarbeiterliste", r"kundenliste", r"abgleich",
    ],
}

_GROUND_TEXT: dict[ProhibitedGround, str] = {
    "detrimental_decisions": "Health data may not be used to take decisions that harm individuals or to identify them",
    "employment_or_insurance_or_credit": "Health data may not be used for decisions about employment, insurance premiums or credit",
    "advertising_or_marketing": "Health data may not be used for advertising or marketing",
    "harmful_products": "Health data may not be used to develop or position harmful products such as tobacco or nicotine products",
    "other_unlawful_or_unethical": "The intended use is against ethics or law",
    "none": "",
}

_PURPOSE_TEXT: dict[AllowedPurpose, str] = {
    "public_interest_public_health": "Protecting public health",
    "policy_making_and_regulation": "Policy-making and improving care",
    "official_statistics": "Official statistics",
    "education_and_teaching": "Teaching",
    "scientific_research": "Scientific research",
    "product_and_algorithm_development": "Developing and testing algorithms and health products",
    "improving_care": "Improving care",
    "none": "Your purpose",
}

_RECORDS_KEYWORDS = [
    r"aggregates? (are|is) not enough", r"statistics (are|is) not (enough|sufficient)", r"individual[- ]level",
    r"patient[- ]level", r"\btrain(ing)?\b.*\bmodel", r"machine learning",
    r"aggregat\w* (reich|genüg)\w* nicht", r"statistik\w* (reich|genüg)\w* nicht", r"individual\w*daten",
    r"patientenbezogen", r"einzelfallbezogen", r"\btrainier\w*.*\bmodell", r"maschinelles lernen",
]
# Wording that names an Art. 53 purpose; checked in this order, the first match wins.
_ALLOWED_PURPOSE_KEYWORDS: dict[AllowedPurpose, list[str]] = {
    "official_statistics": [r"official statistic", r"health report", r"amtliche statistik", r"gesundheitsbericht"],
    "education_and_teaching": [r"teach", r"\beducation", r"\blehr", r"unterricht", r"fortbildung", r"ausbildung"],
    "public_interest_public_health": [
        r"public health", r"prevent", r"surveillance", r"outbreak", r"öffentliche gesundheit", r"prävention",
    ],
    "product_and_algorithm_development": [
        r"algorithm", r"\bmodel", r"artificial intelligence", r"\bai\b", r"predict", r"algorithmus", r"modell",
        r"\bki\b", r"vorhersage",
    ],
    "improving_care": [r"quality", r"treatment gap", r"improv\w* (the )?care", r"versorgung", r"qualität"],
    "policy_making_and_regulation": [r"\bpolic(y|ies)\b", r"regulat", r"health authorit", r"gesundheitspolitik"],
    "scientific_research": [r"research", r"\bstud(y|ies)\b", r"risk factor", r"forsch", r"untersuch", r"studie"],
}
_ACCESS_APPLICATION = re.compile(
    r"access application|zugangsantrag|antrag auf (daten)?zugang|zugang zu gesundheitsdaten", re.IGNORECASE
)


def is_access_application(request: dict) -> bool:
    """A health data access application (records), in English or German wording."""
    return bool(_ACCESS_APPLICATION.search(str(request.get("requested_as", ""))))


def request_text(request: dict) -> str:
    """The parts of the request the LLM reads: applicant, purpose, question, definitions."""
    keys = ["applicant", "requested_as", "requested_format", "purpose", "question", "definitions"]
    return json.dumps({k: request.get(k) for k in keys}, ensure_ascii=False, indent=2)


def keyword_hits(request: dict) -> dict[ProhibitedGround, list[str]]:
    text = " ".join(str(request.get(k, "")) for k in ("purpose", "question")).lower()
    text += " " + str(request.get("applicant", {}).get("organisation", "")).lower()
    hits: dict[ProhibitedGround, list[str]] = {}
    for ground, patterns in _KEYWORDS.items():
        found = [m.group(0) for p in patterns if (m := re.search(p, text))]
        if found:
            hits[ground] = found
    return hits


def _rule_allowed_purpose(request: dict) -> AllowedPurpose:
    text = str(request.get("purpose", "")).lower()
    return next(
        (purpose for purpose, patterns in _ALLOWED_PURPOSE_KEYWORDS.items() if any(re.search(p, text) for p in patterns)),
        "none",
    )


def rule_assessment(request: dict) -> PurposeAssessment:
    """Deterministic assessment used when no LLM is available."""
    hits = keyword_hits(request)
    ground: ProhibitedGround = next(iter(hits), "none")
    text = " ".join(str(request.get(k, "")) for k in ("purpose", "question")).lower()
    justified = is_access_application(request) and any(re.search(p, text) for p in _RECORDS_KEYWORDS)
    return PurposeAssessment(
        prohibited=bool(hits),
        prohibited_ground=ground,
        allowed_purpose="none" if hits else _rule_allowed_purpose(request),
        records_justified=justified,
        justification="; ".join(w for words in hits.values() for w in words) or "No prohibited terms found.",
        explanation_for_applicant="This assessment was made by keyword rules and will be reviewed by staff.",
    )


def refused_assessment() -> PurposeAssessment:
    """The model declined to assess the purpose: treat it as prohibited until staff decide."""
    return PurposeAssessment(
        prohibited=True,
        prohibited_ground="other_unlawful_or_unethical",
        allowed_purpose="none",
        records_justified=False,
        justification="The AI safety system declined to assess this purpose.",
        explanation_for_applicant="Your stated purpose could not be confirmed as allowed. "
                                  "A staff member will review the application.",
    )


@dataclass(frozen=True)
class Decision:
    code: DecisionCode
    articles: list[str]
    reason: str
    legal_basis: list[str]
    flags: list[ReviewFlag]


def decide(request: dict, assessment: PurposeAssessment, *, llm_used: bool) -> Decision:
    flags: list[ReviewFlag] = []
    hits = keyword_hits(request)
    prohibited = assessment.prohibited
    ground = assessment.prohibited_ground
    if not llm_used:
        flags.append(ReviewFlag(reason="Decided by keyword rules only (no LLM available); staff must confirm."))
    elif hits and not assessment.prohibited:
        # Keywords cannot read context ("tobacco control", "marketing authorisation holder"), so they
        # only ask staff to confirm what the AI readings decided.
        flags.append(ReviewFlag(reason=f"Words often linked to prohibited uses appear "
                                       f"({', '.join(sum(hits.values(), []))}); the AI judged the purpose allowed. "
                                       "Staff should confirm."))
    elif assessment.prohibited and not hits:
        flags.append(ReviewFlag(reason="AI judged the purpose prohibited without any keyword match; check the reasoning."))
    if prohibited and ground == "none":
        ground = "other_unlawful_or_unethical"

    purpose = _PURPOSE_TEXT[assessment.allowed_purpose]
    code: DecisionCode
    if prohibited:
        code, articles = "REJECT", ["54"]
        reason = f"Your request is refused. {_GROUND_TEXT[ground]} (Art. 54)."
        basis = [f"Art. 54 – {ARTICLES['54'].title}: {_GROUND_TEXT[ground]}."]
    elif assessment.allowed_purpose == "none":
        code, articles = "REJECT", ["53"]
        reason = ("Your request is refused. No purpose allowed under Art. 53 was given. Health data may only be "
                  "used for the purposes listed there, such as public health, research, official statistics, "
                  "teaching or improving care.")
        basis = [f"Art. 53 – {ARTICLES['53'].title}: no purpose allowed under Art. 53 was given."]
    elif not is_access_application(request):
        code, articles = "APPROVE_STATISTICAL", ["53", "69"]
        reason = (f"{purpose} is an allowed purpose (Art. 53). Anonymised statistics answer your question (Art. 69). "
                  "Groups with fewer than 10 patients are hidden to protect privacy.")
        basis = [f"Art. 53 – {purpose} is an allowed purpose.", "Art. 69 – answered as anonymised statistics."]
    elif assessment.records_justified:
        code, articles = "APPROVE_SPE", ["53", "66", "68", "73"]
        reason = (f"{purpose} is an allowed purpose (Art. 53). You explained why statistics are not enough, so "
                  "pseudonymised records are justified (Art. 66). You may use them only under a data permit, inside "
                  "a secure processing environment; data cannot be downloaded (Art. 68, 73).")
        basis = [
            f"Art. 53 – {purpose} is an allowed purpose.",
            f"Art. 66 – records are justified: {assessment.justification}",
            "Art. 68 – a data permit sets purpose, duration and conditions.",
            "Art. 73 – access only inside the secure processing environment; downloads are blocked.",
        ]
    else:
        code, articles = "APPROVE_STATISTICAL", ["53", "66", "69"]
        reason = (f"{purpose} is an allowed purpose (Art. 53). Your question can be answered with statistics, so "
                  "pseudonymised records are not justified (Art. 66). We approved anonymised statistics instead "
                  "(Art. 69); your numbers are below.")
        basis = [
            f"Art. 53 – {purpose} is an allowed purpose.",
            "Art. 66 – records are not needed: aggregate statistics answer the question.",
            "Art. 69 – answered as anonymised statistics instead.",
        ]
    return Decision(code=code, articles=articles, reason=reason, legal_basis=basis, flags=flags)
