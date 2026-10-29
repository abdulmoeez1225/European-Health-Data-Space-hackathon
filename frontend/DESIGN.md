# Gatekeeper UI — design brief

Gatekeeper is an automated Health Data Access Body (HDAB) under the European Health Data Space,
Regulation (EU) 2025/327, Chapter IV. The UI has one job: make every decision **understandable and
trustworthy** to the person who receives it and to the official who answers for it.

## Users and top tasks

| User                                                     | Context                                                       | Top tasks                                                                              | What they must never miss                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Applicant researcher** (university, ministry, company) | Submits once, waits, reads the outcome. Not a lawyer.         | Pick or paste a request · submit · understand the outcome and what to do next          | The decision, the one-sentence reason, which numbers they got and why some are hidden |
| **HDAB case officer**                                    | Reviews many automated decisions per day; signs or overrides. | Scan the queue · open a case · check AI assessment against the rules · sign / override | Review flags, the cited articles, what the AI judged vs what rules enforced           |
| **SPE researcher**                                       | Holds a data permit; works inside the secure environment.     | See permit and cohort · query records · export aggregates through the airlock          | That nothing leaves except anonymised aggregates; why a query or download was blocked |
| **Privacy officer / jury**                               | Audits that protections actually hold.                        | Understand the differencing attack · run the red team · read ledger and audit log      | That the ledger intervened, and that every block is logged with an ID                 |

## Key moments for the 2-minute demo

1. **Approve with statistics (R01)** — pick a card, submit, watch the five-step timeline, the letter
   reveals: green status, one plain sentence, article chips, a table with `<10` pills.
2. **Reject (R02 insurer)** — red status, the prohibition in plain words, the applicant's own words
   quoted, and "What you can do instead".
3. **Secure environment (R05)** — blue status, exact cohort size, "Open secure environment" →
   locked workspace, `COPY … TO 'out.csv'` is blocked, "Download data" triggers the Art. 73 block
   with an audit ID, airlock export releases aggregates with small rows suppressed.
4. **Red team** — two requests from Curious Analytics GmbH side by side: 33 then a lock on the
   second answer with the footnote "would reveal 1 patient"; the ledger and audit log update live.
5. **Staff console** — the same cases as a queue; open one, see flags, mappings, SQL, checks; sign.

## Information hierarchy per view

**Applicant portal** (`/`)

1. Decision letter (once there is one) — status → why → legal basis → numbers/permit → next steps.
2. Submission: sample gallery (filter by type) → JSON editor with live validation → Submit.
3. Progress timeline replaces the submit area while the LLM runs (5–30 s).

**Staff console** (`/staff`)

1. Queue (left): decision badge, applicant, time, flag count, signed state. Sticky.
2. Case (right): header with status, articles, reason, sign/override → review flags (amber, prominent)
   → AI assessment vs rule outcome → request → code mappings → plan & SQL (collapsible, copyable)
   → privacy checklist → released numbers → permit → execution timings.

**Secure environment** (`/spe`)

1. Permit header: lock, permit ID, applicant, exact cohort size, permit selector, Download button.
2. Blocked-download moment (when triggered).
3. Tables in the environment (cards with row counts and columns).
4. SQL console: editor, Run / Export via airlock, presets; result grid or blocked banner.

**Privacy & audit** (`/privacy`)

1. Explainer: 33 − 32 = 1 patient, as three tiles and a tiny bar visual.
2. Red team: three actions, two compact letters side by side.
3. Release ledger table (suppression events).
4. Live audit log (auto-refresh every 5 s, pausable).

## Design principles

1. **Outcome first.** The status and the one-sentence reason are readable in three seconds; details
   follow in order of importance. Never make anyone hunt for the decision.
2. **Plain language, cited law.** Every legal claim carries an article chip that explains itself on
   hover or tap (from `/api/law`). Never show raw enum names to applicants.
3. **Calm authority.** Neutral surfaces, one deep-blue accent, generous whitespace. Colour is
   reserved for decision status (red / green / blue) and the amber review signal — nothing else
   competes with it.
4. **Protection is visible, not alarming.** `<10` and `suppressed` are calm muted pills with an
   explanation, not errors. Blocks (download, ledger) are firm and specific: what, why, which article,
   audit ID.
5. **Show the machine's work to staff.** AI judgement and rule enforcement are separated; plan, SQL
   and checks are one click away and copyable.
6. **Every state designed.** Loading skeletons, empty states with a next action, errors with a cause.
7. **Accessible by default.** Semantic landmarks, real tabs/links, visible focus, AA contrast in both
   themes, reduced-motion respected, no information by colour alone (icons + text everywhere).

## Design tokens

Defined as CSS custom properties in `src/app/globals.css`, exposed to Tailwind v4 via `@theme inline`,
switched for dark mode by `prefers-color-scheme` (or `?theme=dark|light`).

**Colour** (light / dark)

| Token       | Light         | Dark        | Use                                 |
| ----------- | ------------- | ----------- | ----------------------------------- |
| `bg`        | `#f4f6fa`     | `#0c121c`   | Page                                |
| `surface`   | `#ffffff`     | `#141c29`   | Cards, letter                       |
| `surface-2` | `#eef1f6`     | `#1b2535`   | Table heads, wells                  |
| `line`      | `#d8dee8`     | `#2a3649`   | Borders, dividers                   |
| `fg`        | `#141e30`     | `#e6ebf3`   | Body text (≥ 14:1)                  |
| `muted`     | `#536077`     | `#9ba7bb`   | Secondary text (≥ 5.5:1 on surface) |
| `accent`    | `#0f3d8a`     | `#86aef6`   | Brand, links, primary action, focus |
| `reject`    | `#b1271f`     | `#ff8f86`   | Rejected                            |
| `stats`     | `#17703a`     | `#74d49c`   | Approved – statistics               |
| `spe`       | `#1a52b5`     | `#90b6ff`   | Approved – secure environment       |
| `warn`      | `#7a5200`     | `#f0c560`   | Review flags, override              |
| `*-soft`    | tinted 8–12 % | tinted dark | Status backgrounds                  |

**Type** — system stack (no web fonts, offline). Scale (rem): 0.75 caption · 0.8125 label · 0.875
small · 1 body · 1.125 lead · 1.25 h3 · 1.5 h2 · 1.875 display (letter status). Weights 400/500/600/700.
Tabular figures in every table. Mono: `ui-monospace, SFMono-Regular, Menlo, Consolas`.

**Spacing** — 4 px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48. Card padding 20–28 px; section gap 24–32 px.

**Radii** — 6 px chips/inputs, 10 px buttons, 14 px cards, full for pills.

**Shadows** — `card`: 1 px hairline + soft 16 px blur at 5 % (light only); `raised`: hover/popover.

**Motion** — 150 ms (hover, focus), 250 ms (reveal), `cubic-bezier(.2,.8,.2,1)`. Letter reveal: fade +
8 px rise. Progress dot spins. All disabled under `prefers-reduced-motion`.

## Component inventory

| Component                              | Notes                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppHeader`                            | Brand mark, title "Gatekeeper — Health Data Access Body", subtitle "EHDS · Regulation (EU) 2025/327", mock badge, primary nav (links with `aria-current`) |
| `Button`                               | primary / secondary / ghost / danger; sm / md; icon slot; loading                                                                                         |
| `Card`, `Section`                      | Surface container; section heading with optional actions                                                                                                  |
| `DecisionBadge`                        | Icon + label per decision; sizes sm / lg                                                                                                                  |
| `ArticleChip`                          | "Art. 53" + Radix tooltip with title + summary from `/api/law`                                                                                            |
| `ValuePill`                            | `<10` / `suppressed` muted pill with tooltip explaining the small-cell rule                                                                               |
| `StatsTable`                           | Group labels as row headers, right-aligned tabular numbers, lock + footnote for ledger cells                                                              |
| `DecisionLetter`                       | Hero: status band, reason, legal basis, prohibition + "instead", statistics, permit, next steps                                                           |
| `ProgressTimeline`                     | Five staged steps, elapsed timer, `aria-live`                                                                                                             |
| `SampleGallery`                        | Filterable request cards (radio-group semantics)                                                                                                          |
| `JsonEditor`                           | Monospace textarea, line count, live validation message                                                                                                   |
| `CodeBlock`                            | Collapsible, copy button                                                                                                                                  |
| `CheckList`                            | Pass/fail with icon + text                                                                                                                                |
| `DataGrid`                             | Generic SQL result grid with NULL / pill rendering                                                                                                        |
| `Banner`                               | info / error / blocked (with audit ID)                                                                                                                    |
| `EmptyState`, `Skeleton`, `ErrorState` | Every async region                                                                                                                                        |
| `SignStamp`                            | "Signed by HDAB staff" double-border stamp, undo                                                                                                          |
