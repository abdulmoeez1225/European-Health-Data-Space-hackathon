/** Decision vocabulary: built from structured fields, so letters are proper German in German. */

const en = {
  decision: {
    REJECT: { label: "Refused", short: "Refused", headline: "Your request cannot be granted" },
    APPROVE_STATISTICAL: {
      label: "Statistics granted",
      short: "Statistics",
      headline: "Your statistics are ready",
    },
    APPROVE_SPE: {
      label: "Secure access granted",
      short: "Secure access",
      headline: "You can work with the records in a secure workspace",
    },
  },
  articleTitles: {
    "53": "Purposes of secondary use",
    "54": "Prohibited secondary use",
    "66": "Data minimisation and purpose limitation",
    "67": "Health data access applications",
    "68": "Data permits",
    "69": "Health data requests",
    "71": "Right to opt out",
    "73": "Secure processing environment",
  } as Record<string, string>,
  regulation: "Regulation (EU) 2025/327",
  prohibitions: {
    other: {
      title: "Unlawful or unethical use",
      text: "The stated use conflicts with Union or national law or with ethical requirements.",
      instead: "Clarify the purpose and its legal basis. A narrower, lawful question may be approved.",
    },
    detrimental_decisions: {
      title: "Decisions detrimental to individuals",
      text: "Health data must not be used to take decisions that harm the persons it describes.",
      instead:
        "Describe a population-level purpose, such as planning or research, where no decision is made about any individual.",
    },
    employment_or_insurance_or_credit: {
      title: "Employment, insurance or credit decisions",
      text: "Health data must not be used to decide on jobs, insurance terms or credit, or to exclude people from them.",
      instead:
        "Resubmit with a purpose such as public health research or policy-making, and ask for anonymised statistics that are not linked to your customers or staff.",
    },
    advertising_or_marketing: {
      title: "Advertising and marketing",
      text: "Health data must not be used for advertising, marketing or profiling for commercial promotion.",
      instead:
        "Use a permitted purpose, for example a published epidemiological study. Market sizing for products cannot be supported.",
    },
    harmful_products: {
      title: "Developing harmful products",
      text: "Health data must not be used to develop products or services that harm individuals or society, such as tobacco, alcohol or weapons.",
      instead: "Focus on prevention or care improvement, or apply for a purpose that serves public health.",
    },
  },
  purposes: {
    public_interest_public_health: "Public interest in public health",
    policy_making_and_regulation: "Policy-making and regulation",
    official_statistics: "Official statistics",
    education_and_teaching: "Education and teaching",
    scientific_research: "Scientific research",
    product_and_algorithm_development: "Developing products and algorithms",
    improving_care: "Improving care",
    none: "None",
  },
  purposeShort: {
    public_interest_public_health: "public health",
    policy_making_and_regulation: "policy-making",
    official_statistics: "official statistics",
    education_and_teaching: "education",
    scientific_research: "scientific research",
    product_and_algorithm_development: "algorithm development",
    improving_care: "improving care",
    none: "none recognised",
  },
  prohibitedShort: {
    none: "unlawful or unethical use",
    detrimental_decisions: "decisions against individuals",
    employment_or_insurance_or_credit: "insurance, jobs or credit",
    advertising_or_marketing: "advertising",
    harmful_products: "harmful products",
    other_unlawful_or_unethical: "unlawful or unethical use",
  },
  basis: {
    allowedPurpose: (purpose: string) => `Allowed purpose: ${purpose}`,
    prohibitedUse: (use: string) => `Prohibited use: ${use}`,
    recordsJustified: "Records justified",
    statisticsSuffice: "Statistics suffice, no records",
    applicationAssessed: "Access application assessed",
    permitRequired: "Data permit required",
    anonymisedStatistics: "Answered as anonymised statistics",
    optOutExcluded: "Opted-out patients excluded",
    secureOnly: "Secure workspace only, no download",
  },
  sentence: {
    statistics:
      "The numbers are anonymised: any group with fewer than 10 patients is hidden to protect privacy.",
    speWithCohort: (patients: string) =>
      `Pseudonymised records of ${patients} patients were copied for you. You analyse them inside the workspace; nothing can be downloaded.`,
    spe: "You may analyse pseudonymised records inside a secure workspace; nothing can be downloaded.",
  },
};

export type DecisionMessages = typeof en;

const de: DecisionMessages = {
  decision: {
    REJECT: { label: "Abgelehnt", short: "Abgelehnt", headline: "Ihre Anfrage kann nicht bewilligt werden" },
    APPROVE_STATISTICAL: {
      label: "Statistik bewilligt",
      short: "Statistik",
      headline: "Ihre Statistik liegt vor",
    },
    APPROVE_SPE: {
      label: "Sicherer Zugang bewilligt",
      short: "Sicherer Zugang",
      headline: "Sie können mit den Datensätzen in einem sicheren Arbeitsbereich arbeiten",
    },
  },
  articleTitles: {
    "53": "Zwecke der Sekundärnutzung",
    "54": "Verbotene Sekundärnutzung",
    "66": "Datenminimierung und Zweckbindung",
    "67": "Anträge auf Zugang zu Gesundheitsdaten",
    "68": "Datengenehmigungen",
    "69": "Gesundheitsdatenanfragen",
    "71": "Widerspruchsrecht (Opt-out)",
    "73": "Sichere Verarbeitungsumgebung",
  },
  regulation: "Verordnung (EU) 2025/327",
  prohibitions: {
    other: {
      title: "Rechtswidrige oder unethische Nutzung",
      text: "Die angegebene Nutzung widerspricht Unionsrecht, nationalem Recht oder ethischen Anforderungen.",
      instead:
        "Präzisieren Sie den Zweck und seine Rechtsgrundlage. Eine engere, rechtmäßige Fragestellung kann bewilligt werden.",
    },
    detrimental_decisions: {
      title: "Entscheidungen zum Nachteil Einzelner",
      text: "Gesundheitsdaten dürfen nicht für Entscheidungen verwendet werden, die den betroffenen Personen schaden.",
      instead:
        "Beschreiben Sie einen Zweck auf Bevölkerungsebene, etwa Planung oder Forschung, bei dem über keine Einzelperson entschieden wird.",
    },
    employment_or_insurance_or_credit: {
      title: "Entscheidungen über Beschäftigung, Versicherung oder Kredit",
      text: "Gesundheitsdaten dürfen nicht für Entscheidungen über Arbeitsplätze, Versicherungsbedingungen oder Kredite verwendet werden.",
      instead:
        "Reichen Sie die Anfrage mit einem Zweck wie Public-Health-Forschung oder Politikgestaltung erneut ein und fragen Sie anonymisierte Statistiken an, die nicht mit Ihren Kundinnen, Kunden oder Beschäftigten verknüpft sind.",
    },
    advertising_or_marketing: {
      title: "Werbung und Marketing",
      text: "Gesundheitsdaten dürfen nicht für Werbung, Marketing oder Profiling zur Verkaufsförderung verwendet werden.",
      instead:
        "Nutzen Sie einen zulässigen Zweck, etwa eine veröffentlichte epidemiologische Studie. Marktgrößenschätzungen für Produkte sind nicht möglich.",
    },
    harmful_products: {
      title: "Entwicklung schädlicher Produkte",
      text: "Gesundheitsdaten dürfen nicht zur Entwicklung von Produkten oder Dienstleistungen verwendet werden, die Menschen oder der Gesellschaft schaden, etwa Tabak, Alkohol oder Waffen.",
      instead:
        "Konzentrieren Sie sich auf Prävention oder bessere Versorgung, oder beantragen Sie einen Zweck im Dienst der öffentlichen Gesundheit.",
    },
  },
  purposes: {
    public_interest_public_health: "Öffentliches Interesse an der öffentlichen Gesundheit",
    policy_making_and_regulation: "Politikgestaltung und Regulierung",
    official_statistics: "Amtliche Statistik",
    education_and_teaching: "Bildung und Lehre",
    scientific_research: "Wissenschaftliche Forschung",
    product_and_algorithm_development: "Entwicklung von Produkten und Algorithmen",
    improving_care: "Verbesserung der Versorgung",
    none: "Keiner",
  },
  purposeShort: {
    public_interest_public_health: "öffentliche Gesundheit",
    policy_making_and_regulation: "Politikgestaltung",
    official_statistics: "amtliche Statistik",
    education_and_teaching: "Bildung",
    scientific_research: "wissenschaftliche Forschung",
    product_and_algorithm_development: "Algorithmenentwicklung",
    improving_care: "bessere Versorgung",
    none: "keiner erkannt",
  },
  prohibitedShort: {
    none: "rechtswidrige oder unethische Nutzung",
    detrimental_decisions: "Entscheidungen gegen Einzelne",
    employment_or_insurance_or_credit: "Versicherung, Beschäftigung, Kredit",
    advertising_or_marketing: "Werbung",
    harmful_products: "schädliche Produkte",
    other_unlawful_or_unethical: "rechtswidrige oder unethische Nutzung",
  },
  basis: {
    allowedPurpose: (purpose) => `Zulässiger Zweck: ${purpose}`,
    prohibitedUse: (use) => `Verbotene Nutzung: ${use}`,
    recordsJustified: "Datensätze begründet",
    statisticsSuffice: "Statistik genügt, keine Datensätze",
    applicationAssessed: "Zugangsantrag geprüft",
    permitRequired: "Datengenehmigung erforderlich",
    anonymisedStatistics: "Als anonymisierte Statistik beantwortet",
    optOutExcluded: "Widersprochene Personen (Opt-out) ausgeschlossen",
    secureOnly: "Nur sicherer Arbeitsbereich, kein Download",
  },
  sentence: {
    statistics:
      "Die Zahlen sind anonymisiert: Jede Gruppe mit weniger als 10 Personen wird zum Schutz der Privatsphäre ausgeblendet.",
    speWithCohort: (patients) =>
      `Pseudonymisierte Datensätze von ${patients} Personen wurden für Sie bereitgestellt. Sie werten sie im Arbeitsbereich aus; nichts kann heruntergeladen werden.`,
    spe: "Sie können pseudonymisierte Datensätze in einem sicheren Arbeitsbereich auswerten; nichts kann heruntergeladen werden.",
  },
};

export const decisions = { en, de };
