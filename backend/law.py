"""Plain-language summaries (English and German) of the EHDS articles the decisions cite.

Regulation (EU) 2025/327, Chapter IV. These are summaries for applicants and
staff, not the official text: https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng
"""

from __future__ import annotations

from pydantic import BaseModel

EUR_LEX_URL = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng"


class Article(BaseModel):
    number: str
    title: str
    summary: str


ARTICLES: dict[str, Article] = {a.number: a for a in [
    Article(
        number="53", title="Purposes of secondary use",
        summary="Health data may be reused for public interest in public health, policy-making and regulation, "
                "official statistics, education and teaching, scientific research (including developing and "
                "testing products, algorithms and AI), and improving care.",
    ),
    Article(
        number="54", title="Prohibited secondary use",
        summary="Health data must never be used for decisions that harm people, for decisions on jobs, "
                "insurance premiums or credit, for advertising or marketing, for developing harmful products "
                "such as tobacco, nicotine, alcohol or weapons, or for other uses against ethics or law.",
    ),
    Article(
        number="66", title="Data minimisation and purpose limitation",
        summary="Data is provided anonymised by default. Pseudonymised records are provided only when the "
                "applicant shows that anonymised data cannot achieve the purpose.",
    ),
    Article(
        number="67", title="Health data access applications",
        summary="What an application for access to records must contain and how it is assessed.",
    ),
    Article(
        number="68", title="Data permits",
        summary="Access to pseudonymised records requires a data permit that sets the purpose, duration and "
                "conditions of use.",
    ),
    Article(
        number="69", title="Health data requests",
        summary="An applicant can ask for an answer in anonymised statistical form only; no records are shared.",
    ),
    Article(
        number="71", title="Right to opt out",
        summary="People can opt out of the reuse of their health data; their data is left out of every answer.",
    ),
    Article(
        number="73", title="Secure processing environment",
        summary="Records are accessed only inside a secure processing environment. Data cannot be downloaded; "
                "only anonymised results may leave.",
    ),
]}

ARTICLES_DE: dict[str, Article] = {a.number: a for a in [
    Article(
        number="53", title="Zwecke der Sekundärnutzung",
        summary="Gesundheitsdaten dürfen weiterverwendet werden für das öffentliche Interesse an der öffentlichen "
                "Gesundheit, Politikgestaltung und Regulierung, amtliche Statistik, Aus- und Weiterbildung, "
                "wissenschaftliche Forschung (auch Entwicklung und Erprobung von Produkten, Algorithmen und KI) "
                "sowie die Verbesserung der Versorgung.",
    ),
    Article(
        number="54", title="Verbotene Sekundärnutzung",
        summary="Gesundheitsdaten dürfen nie verwendet werden für Entscheidungen zum Nachteil von Personen, für "
                "Entscheidungen über Arbeitsverhältnisse, Versicherungsprämien oder Kredite, für Werbung oder "
                "Marketing, für die Entwicklung schädlicher Produkte wie Tabak, Nikotin, Alkohol oder Waffen oder "
                "für andere ethisch oder rechtlich unzulässige Zwecke.",
    ),
    Article(
        number="66", title="Datenminimierung und Zweckbindung",
        summary="Daten werden standardmäßig anonymisiert bereitgestellt. Pseudonymisierte Datensätze gibt es nur, "
                "wenn der Antragsteller zeigt, dass anonymisierte Daten für den Zweck nicht ausreichen.",
    ),
    Article(
        number="67", title="Anträge auf Zugang zu Gesundheitsdaten",
        summary="Was ein Antrag auf Zugang zu Datensätzen enthalten muss und wie er geprüft wird.",
    ),
    Article(
        number="68", title="Datengenehmigungen",
        summary="Der Zugang zu pseudonymisierten Datensätzen erfordert eine Datengenehmigung, die Zweck, Dauer und "
                "Bedingungen der Nutzung festlegt.",
    ),
    Article(
        number="69", title="Anfragen nach Gesundheitsdaten",
        summary="Antragsteller erhalten eine Antwort ausschließlich in anonymisierter statistischer Form; "
                "Datensätze werden nicht weitergegeben.",
    ),
    Article(
        number="71", title="Widerspruchsrecht (Opt-out)",
        summary="Personen können der Weiterverwendung ihrer Gesundheitsdaten widersprechen; ihre Daten fließen in "
                "keine Antwort ein.",
    ),
    Article(
        number="73", title="Sichere Verarbeitungsumgebung",
        summary="Datensätze werden nur in einer sicheren Verarbeitungsumgebung genutzt. Sie können nicht "
                "heruntergeladen werden; nur anonymisierte Ergebnisse dürfen die Umgebung verlassen.",
    ),
]}
