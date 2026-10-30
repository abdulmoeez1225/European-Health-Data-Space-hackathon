/** Privacy & audit workspace: red-team check, blocked releases and the activity log. */

const en = {
  page: {
    title: "Privacy & audit",
    description:
      "Oversight for the access body: what was withheld to protect patients, and a complete record of what the system did.",
  },
  redTeam: {
    title: "Red-team check: can two harmless questions expose one patient?",
    subtitle:
      "The small-cell rule checks each answer alone; the ledger remembers what has already been released, to any applicant.",
    question1: (organisation: string) =>
      `${organisation} asks: How many adults with type 2 diabetes live in Burgenland?`,
    question2: "The same applicant asks: How many of them are aged 40 or older?",
    run: "Run both questions",
    asking: "Asking…",
    notRun: "Not run yet",
    waits: "Waits for question 1",
    failed: (step: number) => `Question ${step} failed`,
    noNumber: "No number was released.",
    earlier: "From an earlier run",
    released: "Released (safe on its own)",
    withheldLock: "Withheld by the release ledger",
    withheld: (total: string | null, revealed: number) =>
      `Withheld. Subtracting it from ${total ?? "the first answer"} would reveal ${revealed} ${
        revealed === 1 ? "patient" : "patients"
      }.`,
    blockedSecond: "The release ledger blocked the second answer.",
    seeBlocked: "See in Blocked releases",
  },
  tabs: {
    label: "Blocked releases and activity log",
    blocked: "Blocked releases",
    activity: "Activity log",
    live: (seconds: number) => `Live · updates every ${seconds} s`,
  },
  loading: "Loading",
  blocked: {
    intro:
      "Values withheld because, combined with values already released to any applicant or with the rest of the same answer, they would reveal fewer than 10 patients.",
    loadError: "Could not load the blocked releases",
    emptyTitle: "Nothing blocked yet.",
    emptyText: "Run the red-team check to see one.",
    tableLabel: "Blocked releases",
    columns: {
      time: "Time",
      applicant: "Applicant",
      request: "Request",
      withheldValue: "Withheld value",
      combinedWith: "Combined with",
      wouldReveal: "Would reveal",
    },
    allPatients: "All patients",
    patients: (count: number) => `${count.toLocaleString("en-GB")} ${count === 1 ? "patient" : "patients"}`,
  },
  activity: {
    intro: "Every decision, withdrawal, workspace query, blocked download and export — append-only.",
    show: "Show",
    subject: "Request or permit",
    subjectPlaceholder: "e.g. R05 or permit-R05",
    showing: (shown: string, total: string) => `Showing latest ${shown} of ${total}`,
    loadError: "Could not load the activity log",
    emptyTitle: "No activity matches",
    emptyForSubject: "No events for this request or permit.",
    emptyForFilter: "Nothing has been recorded for this filter yet.",
    tableLabel: "Activity log",
    columns: { time: "Time", event: "Event", actor: "Actor", subject: "Subject", detail: "Detail", id: "ID" },
    loadMore: "Load more",
  },
  labels: {
    all: "All",
    groups: {
      decisions: "Decisions",
      withdrawals: "Withdrawals",
      reopened: "Reopened",
      workspaces: "Workspaces opened",
      queries: "Workspace queries",
      "blocked-queries": "Blocked queries",
      "blocked-downloads": "Blocked downloads",
      airlock: "Airlock exports",
      "blocked-releases": "Blocked releases",
      admin: "Admin",
    } as Record<string, string>,
    events: {
      decision: "Decision",
      decision_withdrawn: "Decision withdrawn",
      decision_reopened: "Refusal reopened",
      spe_created: "Workspace opened",
      spe_deleted: "Workspace deleted",
      spe_query: "Workspace query",
      spe_query_blocked: "Blocked query",
      download_blocked: "Blocked download",
      airlock_released: "Airlock export",
      airlock_blocked: "Blocked airlock export",
      ledger_blocked: "Blocked release",
      ledger_reset: "Ledger reset",
    } as Record<string, string>,
    actors: {
      researcher: "Researcher",
      gatekeeper: "Gatekeeper (automatic)",
      staff: "Staff",
      system: "System",
    } as Record<string, string>,
    detail: {
      withdrawn: "Withdrawn",
      reopened: "Reopened",
      tables: (names: string) => `Tables: ${names}`,
      workspaceCreated: "Workspace created",
      rows: (count: number) => `${count.toLocaleString("en-GB")} ${count === 1 ? "row" : "rows"}`,
      rowsReleased: (rows: string, suppressed: number) => `${rows} released, ${suppressed} suppressed`,
      blockedRelease: (metric: string, other: string, patients: string) =>
        `${metric}: with ${other} it would reveal ${patients}`,
    },
  },
};

export type PrivacyMessages = typeof en;

const de: PrivacyMessages = {
  page: {
    title: "Datenschutz & Protokoll",
    description:
      "Aufsicht für die Zugangsstelle: was zum Schutz von Patientinnen und Patienten zurückgehalten wurde und ein lückenloses Protokoll dessen, was das System getan hat.",
  },
  redTeam: {
    title: "Red-Team-Prüfung: Können zwei harmlose Fragen eine Person offenlegen?",
    subtitle:
      "Die Kleinzellenregel prüft jede Antwort für sich; das Freigabe-Register merkt sich, was bereits freigegeben wurde, egal an welchen Antragsteller.",
    question1: (organisation) =>
      `${organisation} fragt: Wie viele Erwachsene mit Typ-2-Diabetes leben im Burgenland?`,
    question2: "Derselbe Antragsteller fragt: Wie viele von ihnen sind 40 Jahre oder älter?",
    run: "Beide Fragen stellen",
    asking: "Wird gefragt…",
    notRun: "Noch nicht ausgeführt",
    waits: "Wartet auf Frage 1",
    failed: (step) => `Frage ${step} fehlgeschlagen`,
    noNumber: "Es wurde keine Zahl freigegeben.",
    earlier: "Aus einem früheren Durchlauf",
    released: "Freigegeben (für sich allein unbedenklich)",
    withheldLock: "Vom Freigabe-Register zurückgehalten",
    withheld: (total, revealed) =>
      `Zurückgehalten. Zieht man sie von ${total ?? "der ersten Antwort"} ab, würde das ${revealed} ${
        revealed === 1 ? "Person" : "Personen"
      } offenlegen.`,
    blockedSecond: "Das Freigabe-Register hat die zweite Antwort blockiert.",
    seeBlocked: "Unter „Blockierte Freigaben“ ansehen",
  },
  tabs: {
    label: "Blockierte Freigaben und Aktivitätsprotokoll",
    blocked: "Blockierte Freigaben",
    activity: "Aktivitätsprotokoll",
    live: (seconds) => `Live · Aktualisierung alle ${seconds} s`,
  },
  loading: "Wird geladen",
  blocked: {
    intro:
      "Werte, die zurückgehalten wurden, weil sie zusammen mit bereits freigegebenen Werten, egal an welchen Antragsteller, oder mit dem Rest derselben Antwort weniger als 10 Personen offenlegen würden.",
    loadError: "Die blockierten Freigaben konnten nicht geladen werden",
    emptyTitle: "Noch nichts blockiert.",
    emptyText: "Starten Sie die Red-Team-Prüfung, um eine Blockierung zu sehen.",
    tableLabel: "Blockierte Freigaben",
    columns: {
      time: "Zeit",
      applicant: "Antragsteller",
      request: "Anfrage",
      withheldValue: "Zurückgehaltener Wert",
      combinedWith: "Kombiniert mit",
      wouldReveal: "Würde offenlegen",
    },
    allPatients: "Alle Personen",
    patients: (count) => `${count.toLocaleString("de-DE")} ${count === 1 ? "Person" : "Personen"}`,
  },
  activity: {
    intro:
      "Jede Entscheidung, Rücknahme, Abfrage im Arbeitsbereich, jeder blockierte Download und Export — nur anfügbar, nie änderbar.",
    show: "Anzeigen",
    subject: "Anfrage oder Genehmigung",
    subjectPlaceholder: "z. B. R05 oder permit-R05",
    showing: (shown, total) => `Die neuesten ${shown} von ${total}`,
    loadError: "Das Aktivitätsprotokoll konnte nicht geladen werden",
    emptyTitle: "Keine passende Aktivität",
    emptyForSubject: "Keine Ereignisse für diese Anfrage oder Genehmigung.",
    emptyForFilter: "Für diesen Filter wurde noch nichts protokolliert.",
    tableLabel: "Aktivitätsprotokoll",
    columns: {
      time: "Zeit",
      event: "Ereignis",
      actor: "Akteur",
      subject: "Betreff",
      detail: "Details",
      id: "ID",
    },
    loadMore: "Mehr laden",
  },
  labels: {
    all: "Alle",
    groups: {
      decisions: "Entscheidungen",
      withdrawals: "Rücknahmen",
      reopened: "Wieder geöffnet",
      workspaces: "Arbeitsbereiche geöffnet",
      queries: "Abfragen im Arbeitsbereich",
      "blocked-queries": "Blockierte Abfragen",
      "blocked-downloads": "Blockierte Downloads",
      airlock: "Schleusen-Exporte",
      "blocked-releases": "Blockierte Freigaben",
      admin: "Verwaltung",
    },
    events: {
      decision: "Entscheidung",
      decision_withdrawn: "Entscheidung zurückgenommen",
      decision_reopened: "Ablehnung wieder geöffnet",
      spe_created: "Arbeitsbereich geöffnet",
      spe_deleted: "Arbeitsbereich gelöscht",
      spe_query: "Abfrage im Arbeitsbereich",
      spe_query_blocked: "Blockierte Abfrage",
      download_blocked: "Blockierter Download",
      airlock_released: "Schleusen-Export",
      airlock_blocked: "Blockierter Schleusen-Export",
      ledger_blocked: "Blockierte Freigabe",
      ledger_reset: "Freigabe-Register zurückgesetzt",
    },
    actors: {
      researcher: "Forschende(r)",
      gatekeeper: "Gatekeeper (automatisch)",
      staff: "Zugangsstelle",
      system: "System",
    },
    detail: {
      withdrawn: "Zurückgenommen",
      reopened: "Wieder geöffnet",
      tables: (names) => `Tabellen: ${names}`,
      workspaceCreated: "Arbeitsbereich angelegt",
      rows: (count) => `${count.toLocaleString("de-DE")} ${count === 1 ? "Zeile" : "Zeilen"}`,
      rowsReleased: (rows, suppressed) => `${rows} freigegeben, ${suppressed} unterdrückt`,
      blockedRelease: (metric, other, patients) =>
        `${metric}: zusammen mit ${other} würde es ${patients} offenlegen`,
    },
  },
};

export const privacy = { en, de };
