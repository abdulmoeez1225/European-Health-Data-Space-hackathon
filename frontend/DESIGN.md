# Gatekeeper UI — design system

Gatekeeper is an automated Health Data Access Body (HDAB) under the European Health Data Space,
Regulation (EU) 2025/327, Chapter IV. The UI must make every decision understandable to the applicant
who receives it and checkable by the official who answers for it. Its readers are applicants, case
officers and a jury watching a 1080p demo, so it favours readable type and room over density.

## Principles

1. **Outcome first, little text.** A decision is a badge, a headline, one plain sentence and one short
   row per cited article. The full reasoning is one click away ("Full reasoning"), never in the way.
2. **Two workspaces, two audiences.** Applicants and HDAB staff have separate navigation; the applicant
   workspace never lists or links a staff page. A workspace switcher stands in for sign-in.
3. **Issued, not approved.** What the applicant gets is "Statistics granted", "Secure access granted" or
   "Refused", issued instantly. Staff are alerted when the AI was unsure ("Needs attention") and can
   withdraw a decision with a reason the applicant sees; nothing else needs a click.
4. **Room to breathe.** 8 pt grid, generous section gaps, 60ch measure for reading text, hairlines used
   sparingly, surfaces separated by colour rather than borders.
5. **Calm colour.** Soft low-glare light theme, near-black dark theme, one indigo accent (primary
   buttons, focus, active nav, links). Status colours only as tinted badges, dots and icons.
6. **Accessible by default.** Radix dialogs, sheets, tabs and selects; visible focus rings; keyboard
   paths everywhere (arrow keys in lists, Enter adds a definition row, ⌘B toggles the sidebar); AA
   contrast in both themes; `prefers-reduced-motion`; colour never the only signal.

## Tokens (`src/app/globals.css`)

Exposed to Tailwind 4 with `@theme inline`, named like shadcn/ui. `.dark` on `<html>` is set before
first paint by the boot script (`src/lib/preferences.ts`) from Light / Dark / System or `?theme=`.

| Token                         | Light                                  | Dark                  | Use                                  |
| ----------------------------- | -------------------------------------- | --------------------- | ------------------------------------ |
| `sidebar`                     | `#efefec`                              | `#08090a`             | App frame and sidebar                |
| `background`                  | `#f6f6f4` (warm off-white canvas)      | `#0b0c0e`             | Content panel                        |
| `card`                        | `#fbfbfa`                              | `#16171a`             | Raised surfaces (letter, form)       |
| `popover`                     | `#ffffff` (small floating layers only) | `#1c1d21`             | Menus, dialogs, toasts               |
| `muted` / `accent`            | `#f1f1ee` / `#ecebe7`                  | `#1d1e22` / `#222328` | Fills, table heads, hover, selected  |
| `foreground`                  | `#1f2023`                              | `#ececee`             | Text (no pure black or white)        |
| `muted-foreground`            | `#55585f`                              | `#a3a6ad`             | Secondary text                       |
| `subtle-foreground`           | `#63666d`                              | `#7e828a`             | Metadata only (AA on every surface)  |
| `border` / `divider`          | `#e4e3df` / `#ebeae6`                  | `#232428` / `#1d1e22` | Hairlines                            |
| `input` / `field`             | `#dddcd8` / `#fbfbfa`                  | `#2a2b30` / `#16171a` | Form controls; focus ring accent 35% |
| `primary` (+ `primary-hover`) | `#4f46e5` (`#4338ca`)                  | `#5f63ee` (`#6e72f2`) | Primary buttons, focus, links        |
| `success` / `info`            | `#15803d` / `#1d4ed8`                  | `#7cc49a` / `#84aee8` | Statistics granted / Secure access   |
| `destructive` / `warning`     | `#b42318` / `#a15c07`                  | `#e58a8a` / `#e2b75a` | Refused, blocks / flags, overrides   |

Badges use these at ~10 % as background with the full colour as text. Shadows: one soft `shadow-float`
for floating layers in light, none in dark. Radius: 8 px controls, 12 px cards.

**Type scale** (Geist Sans / Geist Mono from the `geist` package, never below 12 px):

| Token             | Size / line height | Use                                                      |
| ----------------- | ------------------ | -------------------------------------------------------- |
| `text-caption`    | 12 / 18            | Timestamps, ids, footnotes, eyebrow labels               |
| `text-data`       | 13 / 20            | Tables, queue rows, code, SQL                            |
| `text-ui`         | 14 / 20            | Buttons, inputs, selects, nav (36 px rows), tabs, labels |
| `text-body`       | 15 / 1.6           | Reading text, descriptions, empty states                 |
| `text-lead`       | 16 / 1.6           | The decision's one plain sentence                        |
| `text-card-title` | 16, 600            | Card and form-section titles                             |
| `text-section`    | 18, 600            | Section headings                                         |
| `text-headline`   | 22, 600            | Decision headline                                        |
| `text-title`      | 24, 600            | Page titles, large numbers                               |

**Spacing**: 4 px base, 8 pt rhythm. Page padding 40 px (24 px on tablets), card padding 24–32 px,
section gap 40 px, field gap 24 px, label to input 8 px. Controls 36 px tall, primary CTA 40 px,
table rows 44 px. Motion: 100–150 ms fades only.

## Components

`src/components/ui`: shadcn/ui on `radix-ui` + `class-variance-authority` + `tailwind-merge` — Sidebar,
Button, Badge, Card, Table, Tabs, Segmented (filter toggles), Tooltip, Collapsible, Select, Input,
Textarea, Label, Separator, Skeleton, DropdownMenu, Dialog, Sheet, Alert, Breadcrumb.

| Component           | Notes                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppSidebar`        | Workspace switcher, workspace nav, theme menu, "Synthetic data · EHDS 2025/327"                                                                  |
| `WorkspaceSwitcher` | Gatekeeper mark as a dropdown: Applicant / Access body (demo stand-in for sign-in)                                                               |
| `TopBar`            | Sidebar toggle and breadcrumb (workspace › page)                                                                                                 |
| `PageHeader`        | 24 px title, one 15 px line, actions on the right (stacked below 1024 px)                                                                        |
| `DecisionLetter`    | Badge → headline → one sentence → legal-basis rows → statistics / permit stats / advice → "Full reasoning" → footer                              |
| `StatsTable`        | Grouped answers as a table (right-aligned figures); an ungrouped answer as one labelled value; `<10`/`suppressed` badges; ledger lock + footnote |
| `DecisionBadge`     | Tinted badge with a dot; short form in lists                                                                                                     |
| `ArticleChip`       | "Art. 53" chip; tooltip with the article title, why it applies, plain summary                                                                    |
| `RequestList`       | Linear issue-list rows (44 px): review icon (staff), id, organisation, flags, decision, time                                                     |
| `ListDetail`        | List beside the selected item ≥ 1280 px, a sheet below; `?id=` selects                                                                           |
| `Toast`             | Small confirmation in the top bar's right corner ("Decision ready", "Loaded R05 — …")                                                            |

## Page anatomy

**Applicant**

- **Request data** (`/`): title and one line, then one form card. Its first row is "Start from": a
  sample select (R01–R10), Import JSON (dialog) and "or fill in the form below". Settings-style
  sections follow (title + one line left, fields right): Applicant, Request (Type with help, Purpose,
  Question), Definitions (rows; Enter adds one; empty state). Replacing an edited form asks first. A
  sticky action bar holds the status (required fields, elapsed seconds while deciding, errors), Clear
  and Submit. The page never shows a decision.
- **Decision page** (`/requests/?id=R05`): back link, "Decision · R05" with the organisation, New request
  (plus Edit and resubmit for refusals, under a fresh id), then the letter ("Issued automatically in X s")
  with the AI's explanation under "Why this decision". A withdrawn decision leads with the withdrawal as
  its headline, quotes the access body's reason under its own label and shows no data. Records access
  starts as "Records access recommended": the permit is shown, the workspace opens once staff issue it.
  A refusal has a card with the case reference and "Ask for a review…" (once), then "Review requested on …".
- **My requests** (`/requests/`): this browser's requests as rows, tagged "Awaiting permit", "Withdrawn",
  "Reconsidering" or "Review requested".
- **Secure workspace** (`/spe/`): pinned secure-session bar (permit, organisation, exact patients, "every query is logged · no downloads"), a lock line instead of any download button (Art. 73; the API still refuses and audits download attempts), a faint watermark naming permit, organisation and time over every record view;
  tabs Browse (tables, filters, 50-row pages), Summarise (no-code "count patients in … by … where …",
  preview, Export via airlock, Show SQL), SQL (advanced) with examples.

**Access body**

- **Decision queue** (`/staff/`): Needs attention · All · Actioned; rows mark waiting permits, review
  requests and decisions the AI was unsure about; detail with the reason it needs attention and actions
  with a required note the applicant sees: "Issue permit…" (conditions) or "Withdraw decision…" for a
  waiting records grant, "Withdraw decision…" for issued grants, "Reopen for manual review…" for refusals
  (next to the applicant's review request); then a stamp. Also letter preview, AI assessment with consensus, code
  mappings, privacy checks, query plan and SQL.
- **Privacy & audit** (`/staff/privacy/`): the red-team check as two numbered questions with their
  outcomes ("33 — released", "<10 — withheld, would reveal 1 patient"), then Blocked releases and the
  Activity log (filter by event group, load more, live every 5 s).

## Language (EN / DE)

Typed dictionaries in `src/i18n`: `en.ts` is the source of keys, `de.ts` is typed against it (a missing key
does not compile; `dictionary.test.ts` also checks parity). Strings are grouped per area in
`src/i18n/messages/` (common, decisions, applicant, staff, spe, privacy). Components use `useT()`; helpers
outside React use `messages()`. The language is stored per browser (`gatekeeper.locale`), defaults to the
browser language (de* → German), can be forced with `?lang=de|en`, sets `<html lang>` before paint, and is
switched in the sidebar footer ("Sprache / Language"). Numbers use `de-DE` grouping (1.152; 8,3), dates
`de-AT` (30.10.2026, 01:06); `<10` stays, "suppressed" reads "unterdrückt". Decision letters are built
from structured fields (decision, articles, assessment, staff action), so German letters are German;
the API's English reasoning appears only under "Begründung (Englisch)". Article summaries come from
`/api/law?lang=de`. Submitted request values (`requested_as`) stay canonical English.
