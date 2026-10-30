/** Staff workspace: the decision queue and the case file of one decision. */

const en = {
  queue: {
    title: "Decision queue",
    intro: "Decisions are issued instantly; you are alerted when the AI was unsure.",
    needAttention: (count: number) => `${count} ${count === 1 ? "needs" : "need"} attention`,
    refresh: "Refresh",
    filterLabel: "Show decisions",
    filterAll: "All",
    filterActioned: "Actioned",
    loadFailed: "Could not load decisions",
    loading: "Loading decisions",
    empty: {
      attention: {
        title: "Nothing needs attention",
        text: "Every decision was issued without a doubt from the AI. You are alerted here when it is unsure.",
      },
      all: {
        title: "No decisions yet",
        text: "Decisions appear here as soon as an applicant submits a request.",
      },
      actioned: {
        title: "Nothing actioned",
        text: "Grants you withdraw and refusals you reopen are listed here.",
      },
    },
  },
  detail: {
    attentionTitle: "Why this needs attention",
    permit: "Permit",
    patients: (count: string) => `${count} patients`,
    previewLetter: "Preview letter",
    letterTitle: (id: string) => `Decision letter for ${id}`,
    letterDescription: "As sent to the applicant",
    assessment: {
      title: "AI assessment",
      prohibitedGround: "Prohibited ground",
      none: "None",
      purpose: "Purpose",
      recordsJustified: "Records justified",
      yes: "Yes",
      no: "No",
      consensus: "Consensus",
    },
    consensus: {
      assessment: "Assessment",
      plan: "Plan",
      agreed: (agreeing: number, votes: number) => `${agreeing} of ${votes} independent readings agreed`,
      notMeasured: "Not measured",
    },
    mappings: {
      title: "Code mappings",
      system: "System",
      prefix: "Prefix",
      found: "Codes found in the data",
      none: "No codes found",
    },
    privacyChecks: { title: "Privacy checks", passed: "Passed", failed: "Failed" },
    plan: {
      title: "Query plan and SQL",
      description: "The language model writes the plan; the SQL is compiled from it by rules.",
      planBlock: "Query plan",
    },
  },
  withdrawn: {
    stamp: "Withdrawn by staff",
    releasedPulled: "Released data was pulled; the case is handled manually.",
  },
  reopened: { stamp: "Reopened by staff" },
  reopen: {
    trigger: "Reopen for manual review…",
    title: "Reopen this refusal?",
    description:
      "The refusal is set aside and the case is reconsidered manually by the access body. The applicant sees that it is being reconsidered.",
    placeholder: "Why the refusal is reconsidered. The applicant reads this.",
    required: "A reason is required to reopen.",
    submit: "Reopen",
  },
  withdraw: {
    trigger: "Withdraw decision…",
    title: "Withdraw this decision?",
    description:
      "Released statistics or the secure workspace are pulled and the case moves to manual handling. The applicant sees the reason.",
    reason: "Reason",
    placeholder: "Why the decision does not stand. The applicant reads this.",
    required: "A reason is required to withdraw.",
    cancel: "Cancel",
    submit: "Withdraw",
  },
};

export type StaffMessages = typeof en;

const de: StaffMessages = {
  queue: {
    title: "Entscheidungen prüfen",
    intro: "Entscheidungen werden sofort erteilt; Sie werden benachrichtigt, wenn die KI unsicher war.",
    needAttention: (count) => `${count} ${count === 1 ? "benötigt" : "benötigen"} Aufmerksamkeit`,
    refresh: "Aktualisieren",
    filterLabel: "Entscheidungen anzeigen",
    filterAll: "Alle",
    filterActioned: "Bearbeitet",
    loadFailed: "Entscheidungen konnten nicht geladen werden",
    loading: "Entscheidungen werden geladen",
    empty: {
      attention: {
        title: "Nichts benötigt Aufmerksamkeit",
        text: "Die KI hatte bei keiner Entscheidung Zweifel. Hier werden Sie benachrichtigt, wenn sie unsicher ist.",
      },
      all: {
        title: "Noch keine Entscheidungen",
        text: "Entscheidungen erscheinen hier, sobald eine antragstellende Person eine Anfrage einreicht.",
      },
      actioned: {
        title: "Nichts bearbeitet",
        text: "Zurückgezogene Bewilligungen und wieder geöffnete Ablehnungen erscheinen hier.",
      },
    },
  },
  detail: {
    attentionTitle: "Warum das Aufmerksamkeit braucht",
    permit: "Datengenehmigung",
    patients: (count) => `${count} Personen`,
    previewLetter: "Schreiben ansehen",
    letterTitle: (id) => `Entscheidungsschreiben zu ${id}`,
    letterDescription: "So wurde es an die antragstellende Person gesendet",
    assessment: {
      title: "KI-Bewertung",
      prohibitedGround: "Verbotener Grund",
      none: "Keiner",
      purpose: "Zweck",
      recordsJustified: "Datensätze begründet",
      yes: "Ja",
      no: "Nein",
      consensus: "Übereinstimmung",
    },
    consensus: {
      assessment: "Bewertung",
      plan: "Plan",
      agreed: (agreeing, votes) => `${agreeing} von ${votes} unabhängigen Auswertungen stimmten überein`,
      notMeasured: "Nicht gemessen",
    },
    mappings: {
      title: "Code-Zuordnungen",
      system: "System",
      prefix: "Präfix",
      found: "In den Daten gefundene Codes",
      none: "Keine Codes gefunden",
    },
    privacyChecks: { title: "Datenschutzprüfungen", passed: "Bestanden", failed: "Nicht bestanden" },
    plan: {
      title: "Abfrageplan und SQL",
      description: "Das Sprachmodell erstellt den Plan; das SQL wird daraus regelbasiert erzeugt.",
      planBlock: "Abfrageplan",
    },
  },
  withdrawn: {
    stamp: "Von der Zugangsstelle zurückgezogen",
    releasedPulled: "Freigegebene Daten wurden zurückgeholt; der Fall wird manuell bearbeitet.",
  },
  reopened: { stamp: "Von der Zugangsstelle wieder geöffnet" },
  reopen: {
    trigger: "Zur manuellen Prüfung wieder öffnen…",
    title: "Diese Ablehnung wieder öffnen?",
    description:
      "Die Ablehnung wird ausgesetzt und der Fall von der Zugangsstelle manuell erneut geprüft. Die antragstellende Stelle sieht, dass der Fall erneut geprüft wird.",
    placeholder:
      "Warum die Ablehnung erneut geprüft wird. Die antragstellende Stelle liest diese Begründung.",
    required: "Für das Wiederöffnen ist eine Begründung erforderlich.",
    submit: "Wieder öffnen",
  },
  withdraw: {
    trigger: "Entscheidung zurückziehen…",
    title: "Diese Entscheidung zurückziehen?",
    description:
      "Freigegebene Statistiken oder der sichere Arbeitsbereich werden zurückgeholt und der Fall geht in die manuelle Bearbeitung. Die antragstellende Person sieht die Begründung.",
    reason: "Begründung",
    placeholder: "Warum die Entscheidung keinen Bestand hat. Die antragstellende Person liest dies.",
    required: "Zum Zurückziehen ist eine Begründung erforderlich.",
    cancel: "Abbrechen",
    submit: "Zurückziehen",
  },
};

export const staff = { en, de };
