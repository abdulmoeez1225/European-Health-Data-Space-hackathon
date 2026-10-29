# Gatekeeper: an automated Health Data Access Body

Gatekeeper decides requests for European Health Data Space (EHDS) data within seconds. It cites Regulation (EU) 2025/327 and computes privacy-protected statistics. When a request justifies patient-level records, it creates a secure processing environment (SPE) from which nothing can be downloaded. It also blocks a privacy attack that the plain small-cell rule misses: combining two harmless answers to reveal one patient.

The track brief is in [docs/TRACK.md](docs/TRACK.md).

## Run it

Requirements: Python 3.12 and Node 22.

```bash
make install          # Python venv + backend dependencies
make frontend         # build the Next.js app into frontend/out
make run              # API + app on http://localhost:8000 (builds the frontend first if missing)
make check            # ruff + mypy + pytest
make eval             # 10 requests × 3 runs → eval/results.md
make eval-fresh       # the same, with the LLM cache off
make eval-hidden      # 12 extra jury-style requests
```

Frontend development: run `make run` in one terminal and `make dev-frontend` in another, then open http://localhost:3000. Adding `?mock=1` to any page shows the UI with built-in sample data and no backend. See [frontend/README.md](frontend/README.md).

**LLM backend:** set `GATEKEEPER_LLM` to choose one. The default is `auto`.

| Value | Uses | Needs |
|---|---|---|
| `api` | Anthropic API (`claude-opus-5-5`, low effort) | `ANTHROPIC_API_KEY` |
| `cli` | the local `claude` CLI (Claude Code), signed in with a Claude subscription | `claude` on PATH |
| `rules` | keyword rules only; every decision is flagged for staff review and no new plans can be made | nothing |

`auto` uses the API if a key is set, otherwise the CLI if it is installed, otherwise rules. Answers are cached in `.cache/llm/`. Delete that folder, or run `make eval-fresh`, to measure without the cache.

Other settings, all optional: `GATEKEEPER_LLM_EFFORT` (default `low`), `GATEKEEPER_API_MODEL`, `GATEKEEPER_CLI_MODEL`, `GATEKEEPER_DATA_DIR`, `GATEKEEPER_STATE_DIR`, `GATEKEEPER_CACHE_DIR`, `GATEKEEPER_CORS_ORIGINS`, `GATEKEEPER_LOG_LEVEL`. See [app/config.py](app/config.py).

## What it does

1. **Decides** `REJECT`, `APPROVE_STATISTICAL` or `APPROVE_SPE`, following the order in the brief, and cites the articles.
2. **Computes statistics** under the small-cell rule:
   - every group is shown, even when empty;
   - counts below 10 are shown as `<10`;
   - percentages and means are `suppressed` below 10 patients;
   - values are rounded to one decimal, halves up, using exact decimals.
3. **Builds an SPE:**
   - a separate DuckDB file per data permit (`state/spe/permit-<id>.duckdb`), holding only the selected patients and the requested record types, with their patient IDs kept;
   - a read-only SQL console;
   - downloads return **403**, and `COPY`/`EXPORT`/file access are blocked;
   - an **airlock** lets aggregate results out only after small-cell checking.
4. **Shows** a plain-language decision letter to the applicant and a full audit view to staff.

## Architecture

![Architecture](docs/architecture.svg)

Editable source: [docs/architecture.excalidraw](docs/architecture.excalidraw), which opens on excalidraw.com or in the VS Code Excalidraw extension.

The design rule: **AI reads the request; code computes the answer.** The LLM only sees request text and never patient data. It never writes SQL.

| Component | File | What it does |
|---|---|---|
| Database | [app/db.py](app/db.py) | Loads the 5 CSVs into in-memory DuckDB. All queries go through views that **already exclude opted-out patients** (Art. 71), so no query can forget them. |
| Terminology catalog | [app/terminology.py](app/terminology.py) | Lists the ICD-10, ATC and LOINC codes that exist in the data. The LLM maps plain-English terms only onto these codes, and staff see what each code prefix matched. |
| LLM layer | [app/llm.py](app/llm.py) | Structured output through the Anthropic API or the `claude` CLI. A disk cache keyed by the prompt hash means the same request always gets the same reading. |
| Purpose assessment | [app/decide.py](app/decide.py) | The LLM judges the Art. 54 ground, the Art. 53 purpose, and whether records are justified. A keyword check catches prohibited uses; if the two disagree, the stricter outcome wins and staff are flagged. |
| Decision ladder | [app/decide.py](app/decide.py) | Deterministic rules turn the assessment into the decision, articles and plain-language reason. |
| Query plan | [app/plan.py](app/plan.py), [app/planner.py](app/planner.py) | The LLM translates the definitions into a typed, validated plan: cohort criteria, groupings (region, hospital, sex, age band, encounter type, year), and metrics (count, percent, mean of latest value). |
| Compiler | [app/compiler.py](app/compiler.py) | Turns the plan into SQL deterministically. Covers main-diagnosis filters on stays (`primary_icd10`), grouping by hospital (`data_holder`), active-medication rules and measurement thresholds. |
| Statistics + small-cell rule | [app/stats.py](app/stats.py) | Aggregates exactly and applies the small-cell rule. |
| Release ledger | [app/ledger.py](app/ledger.py) | Remembers which patients stood behind every value released to each applicant. If a new value, combined with an earlier one, would reveal 1–9 patients, it is withheld and the reason is shown. |
| Privacy firewall | [app/pipeline.py](app/pipeline.py) | Checks before release: no opted-out patient, no small cell, no patient-level identifiers, every group present. If any check fails, the release is blocked. |
| SPE | [app/spe.py](app/spe.py) | Builds the permit database, read-only console, blocked downloads and the airlock (Art. 73). |
| Audit log | [app/audit.py](app/audit.py) | Append-only log of decisions, SPE queries, blocked downloads and ledger blocks. |
| API | [app/api.py](app/api.py) | FastAPI with a fully typed OpenAPI schema, `/api/health`, one JSON log line per request, and CORS for the dev server. It also serves the exported frontend. |
| Frontend | [frontend/](frontend/) | Next.js (App Router, static export), React 19, TypeScript (strict), Tailwind CSS 4, Radix primitives, TanStack Query. API types are generated from the OpenAPI schema. Four routes: `/` applicant portal, `/staff/` staff console, `/spe/` secure environment, `/privacy/` privacy & audit. Design rationale is in [frontend/DESIGN.md](frontend/DESIGN.md). |
| CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) | Backend: ruff, mypy, pytest. Frontend: lint, typecheck, Vitest, build. Tests never call the LLM. |
| Evaluation | [eval/](eval/) | Measures the brief's metrics over N runs. `eval/hidden/` holds 12 extra jury-style requests with answers computed by separate, hand-written SQL. |

### Models and services

- **Claude:** Opus 5.5 through the API, or Sonnet through the Claude Code CLI, both at low effort. It receives only request text and the code catalog (code lists and labels, no counts or patient rows). Two calls run in parallel: purpose assessment and query plan. A rejected request returns as soon as the assessment is in, without waiting for the plan.
- **Backend:** Python 3.12, DuckDB 2.0, FastAPI, pydantic 2, the Anthropic SDK; ruff and mypy.
- **Frontend:** Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4, TanStack Query 5, Vitest. No runtime CDN or web fonts, so the demo works offline.

### Red-team demo: the differencing attack

The same applicant asks two questions:

1. "Adults with type 2 diabetes in Burgenland" → **33**.
2. "Adults aged 40+ with type 2 diabetes in Burgenland" → would be **32**.

Both are 10 or more, so the brief's small-cell rule releases both, and 33 − 32 = **1** identifiable person. Gatekeeper withholds the second answer: *"combined with RT-1 this would reveal 1 patient"*. Try it in **Privacy & audit → Red team**.

## Metric results

Measured with `make eval-fresh`: live Claude Sonnet calls (low effort) through the CLI, **LLM cache off**, 3 runs per request. Per-request details are in [eval/results.md](eval/results.md).

**The 10 track requests**

| Metric | Result | Target |
|---|---|---|
| Correct decisions | **10 of 10** | 10 of 10 |
| Correct numbers | **6 of 6** | 6 of 6 |
| Privacy leaks | **0** | 0 |
| Consistency (3 runs) | **10 of 10** | 10 of 10 |
| Time to answer (slowest) | **14.9 s** | Under 60 s |

**12 extra jury-style requests** ([eval/hidden/](eval/hidden/), answers computed by separate hand-written SQL)

These cover: grouping by hospital, main-diagnosis filters on stays (heart failure, hip fracture, pneumonia), emergency visits, lab-value thresholds (eGFR < 60), terms given without codes ("asthma", "chronic kidney disease"), a two-way grouping, a bank checking creditworthiness, a crowd-control chemical developer, and a justified and an unjustified records application.

| Metric | Result |
|---|---|
| Correct decisions | **12 of 12** |
| Correct numbers | **10 of 10** |
| Privacy leaks | **0** |
| Consistency | **12 of 12** |
| Time to answer (slowest) | **12.6 s** |

Rejections return in about 5 s, because they don't wait for the query plan. The cache is on by default, so a resubmitted request returns its stored reading in well under a second.

## What does not work (yet)

- The article texts in [app/law.py](app/law.py) are plain-language summaries, not the official wording.
- Staff sign-off and override are shown in the UI but not stored.
- The ledger state is in memory and resets when the server restarts. The audit log is kept on disk.
- The ledger catches differencing between nested groups (one group contained in another). It does not catch every combination of overlapping queries.
