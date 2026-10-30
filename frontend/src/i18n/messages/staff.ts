/** Staff workspace: the decision queue and the case file of one decision. */

const en = {
  queue: {
    title: "Decision queue",
    intro:
      "Decisions are issued instantly, except records access, which waits for you to issue the data permit. You are alerted when the AI was unsure or an applicant asks for a review.",
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
        text: "No data permit is waiting, no applicant has asked for a review, and the AI was sure about every decision.",
      },
      all: {
        title: "No decisions yet",
        text: "Decisions appear here as soon as an applicant submits a request.",
      },
      actioned: {
        title: "Nothing actioned",
        text: "Permits you issue, grants you withdraw and refusals you reopen are listed here.",
      },
    },
  },
  detail: {
    attentionTitle: "Why this needs attention",
    permitWaitingTitle: "Data permit waiting for you",
    permitWaitingText:
      "The AI recommended access to pseudonymised records. The secure workspace is prepared but locked until you issue the permit. If access should not be granted, withdraw the decision.",
    appealTitle: (date: string) => `The applicant asked for a review on ${date}`,
    appealNext: "Reopen the refusal to review it manually.",
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
  permitIssued: { stamp: "Permit issued by staff", conditions: "Conditions" },
  issuePermit: {
    trigger: "Issue permit…",
    title: "Issue the data permit?",
    description:
      "The secure workspace opens for the applicant. Note the conditions of the permit; the applicant reads them.",
    reason: "Conditions",
    placeholder:
      "For example: valid for 12 months; only model weights and metrics leave through the airlock.",
    required: "Note the conditions of the permit.",
    submit: "Issue permit",
  },
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
    intro:
      "Entscheidungen werden sofort erteilt, außer Zugang zu Datensätzen: Dafür erteilen Sie die Datengenehmigung. Sie werden benachrichtigt, wenn die KI unsicher war oder eine Überprüfung beantragt wird.",
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
        text: "Keine Datengenehmigung wartet, niemand hat eine Überprüfung beantragt, und die KI war bei jeder Entscheidung sicher.",
      },
      all: {
        title: "Noch keine Entscheidungen",
        text: "Entscheidungen erscheinen hier, sobald eine antragstellende Person eine Anfrage einreicht.",
      },
      actioned: {
        title: "Nichts bearbeitet",
        text: "Erteilte Genehmigungen, zurückgezogene Bewilligungen und wieder geöffnete Ablehnungen erscheinen hier.",
      },
    },
  },
  detail: {
    attentionTitle: "Warum das Aufmerksamkeit braucht",
    permitWaitingTitle: "Datengenehmigung wartet auf Sie",
    permitWaitingText:
      "Die KI hat den Zugang zu pseudonymisierten Datensätzen empfohlen. Der sichere Arbeitsbereich ist vorbereitet, aber gesperrt, bis Sie die Genehmigung erteilen. Soll kein Zugang gewährt werden, ziehen Sie die Entscheidung zurück.",
    appealTitle: (date) => `Die antragstellende Person hat am ${date} eine Überprüfung beantragt`,
    appealNext: "Öffnen Sie die Ablehnung wieder, um sie manuell zu prüfen.",
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
  permitIssued: { stamp: "Genehmigung von der Zugangsstelle erteilt", conditions: "Auflagen" },
  issuePermit: {
    trigger: "Genehmigung erteilen…",
    title: "Datengenehmigung erteilen?",
    description:
      "Der sichere Arbeitsbereich öffnet sich für die antragstellende Person. Halten Sie die Auflagen der Genehmigung fest; die antragstellende Person liest sie.",
    reason: "Auflagen",
    placeholder:
      "Zum Beispiel: gültig für 12 Monate; nur Modellgewichte und Kennzahlen verlassen den Bereich über die Schleuse.",
    required: "Halten Sie die Auflagen der Genehmigung fest.",
    submit: "Genehmigung erteilen",
  },
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
