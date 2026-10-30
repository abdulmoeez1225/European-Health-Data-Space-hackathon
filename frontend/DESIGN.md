# Gatekeeper UI — design system

Gatekeeper is an automated Health Data Access Body (HDAB) under the European Health Data Space,
Regulation (EU) 2025/327, Chapter IV. The UI must make every decision understandable to the applicant
who receives it and checkable by the official who answers for it.

## Principles

1. **Outcome first.** The decision, one plain sentence and the cited articles come before any detail.
2. **Two workspaces, two audiences.** Applicants (researchers and organisations) and HDAB staff get
   separate navigation. The applicant workspace never lists or links a staff page. Without sign-in, a
   workspace switcher stands in for roles.
3. **Linear-style restraint.** Neutral surfaces, hairline borders, almost no shadows, one indigo accent for
   primary actions and focus. Colour appears only as small status dots, icons and badge text.
4. **Dense but calm.** 13–14 px UI text, 8 px spacing rhythm, one primary action per page.
5. **Protection is visible, not alarming.** `<10` and `suppressed` are muted badges with a tooltip and a
   one-line legend. Blocks (download, ledger, SQL) are specific: what, why, which article, audit id.
6. **Accessible by default.** Real landmarks, tabs, dialogs and sheets (Radix), visible focus rings,
   keyboard paths for every action, AA contrast in both themes, `prefers-reduced-motion` respected,
   no information by colour alone.

## Tokens

CSS custom properties in `src/app/globals.css`, exposed to Tailwind 4 with `@theme inline` and named
like shadcn/ui. Dark mode is the `.dark` class on `<html>`, set before first paint by the boot script
(`src/lib/preferences.ts`) from the stored choice (Light, Dark or System) or `?theme=`.

| Token                                     | Light         | Dark          | Use                                            |
| ----------------------------------------- | ------------- | ------------- | ---------------------------------------------- |
| `sidebar`                                 | `#f7f7f8`     | `#08090a`     | App frame and sidebar                          |
| `background`                              | `#ffffff`     | `#0f1011`     | Content panel                                  |
| `card` / `popover`                        | `#ffffff`     | `#141516`     | Letter, form, menus                            |
| `foreground`                              | `#1f2023`     | `#f7f8f8`     | Text                                           |
| `muted-foreground`                        | `#6b6f76`     | `#8a8f98`     | Secondary text (≥ 4.9:1)                       |
| `border` / `input`                        | `#e8e8ea`     | white 8–10 %  | Hairlines, fields                              |
| `accent`                                  | `#f1f1f3`     | `#1c1d20`     | Hover and selected rows                        |
| `primary` / `ring`                        | `#5e6ad2`     | `#5e6ad2`     | Primary button, focus ring                     |
| `success` / `info` / `destructive`        | green / blue / red | lighter tints | Decision dots: statistics / secure env. / rejected |
| `warning`                                 | `#a35f00`     | `#f2c94c`     | Review flags, override                         |

Radius: `--radius` 8 px (`rounded-lg`), 6 px controls, 4 px chips. Type: Geist Sans and Geist Mono from
the `geist` package (bundled, no CDN), tabular figures in tables. Motion: 100–150 ms fades only.

## Components

`src/components/ui` holds shadcn/ui components built on `radix-ui`, `class-variance-authority` and
`tailwind-merge`: Sidebar, Button, Badge, Card, Table, Tabs, Tooltip, Collapsible, Select, Input,
Textarea, Label, Separator, Skeleton, DropdownMenu, Dialog, Sheet, Alert, Breadcrumb.

Domain components in `src/components`:

| Component           | Notes                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `AppSidebar`        | Workspace switcher, workspace nav, theme menu, "Synthetic data · EHDS 2025/327"   |
| `WorkspaceSwitcher` | Gatekeeper mark as a dropdown: Applicant / Access body, remembered locally         |
| `TopBar`            | Sidebar toggle (⌘B) and breadcrumb (workspace › page)                              |
| `PageHeader`        | 17 px title, one muted line, actions on the right                                  |
| `DecisionLetter`    | Badge, headline, reason, article chips, then statistics, permit or advice          |
| `StatsTable`        | Right-aligned figures, small-cell badges, lock and footnote for ledger cells       |
| `DecisionBadge`     | Neutral badge with a status dot; short form in lists                               |
| `ArticleChip`       | "Art. 53" with a tooltip: title, why it applies here, plain summary (`/api/law`)   |
| `SmallCellBadge`    | `<10` / `suppressed` with the small-cell rule in a tooltip                         |
| `RequestList`       | Linear issue-list rows: id, organisation, decision, flags, time; arrow keys        |
| `ListDetail`        | List beside the selected item ≥ 1280 px, a sheet below; `?id=` selects             |
| `CodeBlock`         | Collapsible code with copy button (query plan, SQL)                                |

## Page anatomy

Every page: top bar (toggle, breadcrumb), then a page header row (title, one line, actions), then
content in the inset panel (max 1100 px, the form at 768 px).

**Applicant workspace**

- **Request data** (`/`): header actions Import JSON (dialog that fills the form) and Load sample. The
  form is the single source of what is submitted: Applicant, Request type, Purpose, Question,
  Definitions (add, remove, Enter adds a row). Sticky action bar with Clear and Submit; while deciding,
  an inline status line and a 1 px progress bar. The decision letter appears above the form.
- **My requests** (`/requests/`): requests submitted from this browser, as rows; the selected one shows
  its decision letter, read-only.
- **Secure workspace** (`/spe/`): permits from this browser's requests only. Permit strip, Download data
  (always blocked, Art. 73, with audit id), tables with row counts, SQL console with Run, Export via
  airlock and two presets (Try COPY to file, Airlock export), results table (max 200 rows).

**Access body workspace**

- **Decision queue** (`/staff/`): all decisions as rows; detail with Approve / Override, letter preview,
  review flags, AI assessment, consensus of independent readings, code mappings, privacy checks, query
  plan and SQL.
- **Privacy & audit** (`/staff/privacy/`): differencing explainer (33 − 32 = 1 patient), red team (Run
  attack, Reset ledger) with RT-1 and RT-2 side by side, Ledger and Audit log tabs (the audit log
  refreshes every 5 s while visible).
