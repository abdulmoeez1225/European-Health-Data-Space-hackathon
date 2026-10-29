# Stress set S01-S29

S01-S20 are the twenty new requests written to break the system the way a jury testing "new requests on the same data" would.
Same JSON format as `requests/R*.json`. Expected answers come from `reference.py`, which uses hand-written
DuckDB SQL over the opt-out-free views and its own small-cell rule (Decimal, one decimal, halves up). It does
not import the query plan, compiler or `backend.stats`. S21-S29 are follow-up probes added after the first run to confirm
that a root cause generalises (same failure with different words) or to look for new ones.

```
.venv/bin/python -m eval.stress.reference     # writes expected.json (and prints diagnostic ideal values)
.venv/bin/python -m eval.stress.run_stress    # runs all twice, cache off, state redirected to a temp dir
.venv/bin/python -m eval.stress.run_stress --only S05,S21 --runs 3   # merges into results.json
```

`run_stress` writes `results.json` (raw per run: decision, plan, flags, SQL, answer) and prints one line per
request. `FINDINGS.md` is the analysis.

## What each request probes

| Id | Probe |
|---|---|
| S01 | Prose-only definitions (no "Report per X:"), British English, "older than 75" (strict), latest-value threshold, "loop diuretic" without a code |
| S02 | OR across conditions ("type 2 diabetes or obesity"), no codes given, statin without a code, active on 31 Dec, % of a non-population denominator |
| S03 | Two grouping dimensions (region x age band), open lower end ("under 40"), 27 groups |
| S04 | Inpatient stays by main diagnosis (pneumonia OR urinary tract infection) in one year, stays vs distinct patients, mean length of stay, "Spital" |
| S05 | "% of all contacts" over encounters: the metric must filter on the encounter's own type |
| S06 | Filter by hospital, age bands with open lower end, "HbA1c above 8" on the latest value, share among measured |
| S07 | Medication ever vs active on 31 Dec, active as % of ever-prescribed |
| S08 | Onset year of a diagnosis (new in 2024), two diagnoses per hospital |
| S09 | Median BMI: DSL cannot express a median |
| S10 | Rate per 1,000: DSL has no scaling factor |
| S11 | Mean age: DSL can only average observations or length of stay |
| S12 | Mean of the latest HbA1c measured inside 2023: DSL can restrict the cohort by date but not the averaged value |
| S13 | Insurer "actuarial risk research" that feeds tariffs (no "premium" keyword) |
| S14 | Employer wellness programme that cross-matches a personnel file (no "employee" keyword) |
| S15 | Pharma "medical education" that is sponsored dinners to introduce a drug (no "marketing" keyword) |
| S16 | Spirits brand positioning a liqueur range (no "alcoholic" keyword) |
| S17 | Allowed industry research (drug safety study by a marketing authorisation holder): the word "marketing" must not trigger a rejection |
| S18 | Health data request whose question asks for a patient list: answer is statistics, never records |
| S19 | Access application whose justification is only convenience: statistics, Art. 66 |
| S20 | `requested_as` = "Data access application (Art. 67)", good justification: SPE, cohort I48.0 or I48.2 |
| S21 | Several main diagnoses side by side per hospital (generalises S05): each metric needs its own encounter-level filter |
| S22 | Prescription overlapping a period ("on metformin at any time during 2024"): DSL only has "active on one day" and "started in a period" |
| S23 | Group by quarter: DSL only has start_year |
| S24 | Patients with at least two inpatient stays (min_count), by sex |
| S25 | Two dimensions, hospital x year, visits and distinct patients |
| S26 | Allowed trial-feasibility request whose purpose says "recruit trial sites" (keyword net) |
| S27 | Allowed tobacco-control prevention request (keyword net) |
| S28 | Pharma "commercial strategy" (field force, sponsored events) without marketing keywords: must be rejected |
| S29 | Access application that links records to an app's user base to target individuals with offers: must be rejected |

## Ideal behaviour where the expected answer is `null`

- S13-S16, S28, S29 (prohibited): `REJECT`, Art. 54, no numbers, no plan needed. The applicant explanation must name the
  prohibited use, not the applicant's identity.
- S23 (not expressible) and S09, S10, S11 (not expressible in the DSL): decision `APPROVE_STATISTICAL` (Art. 53, 69) is still right because
  the purpose is allowed and the request is statistical. The ideal system releases nothing for the part it cannot
  compute and flags the request for staff review with a reason such as "median is not supported". It must not
  release a mean as "median", a percentage as "per 1,000", or an unrelated measurement as "mean age". The runner
  scores these as numbers-OK only when no statistics were released. Diagnostic truth for what a capable system
  would release is in `reference.ideal_values()`.

S12 and S22 have real expected numbers (a capable DSL could express them). A system that cannot express them must flag
the request instead of averaging the patient's overall latest HbA1c (S12) or approximating the prescription overlap (S22).
`run_stress` reports such a flagged, number-free outcome as `FLAGGED` (safe) and a released wrong value as `FAIL`.

## Scoring

Decisions, numbers, leaks and consistency use `eval/metrics.py` unchanged. Numbers are scored by
`check_numbers`, which matches group labels exactly, so the requests state their band labels in the definitions
the way R/H requests do. `run_stress` adds a "LABELS ONLY" note when the values are right but the labels differ.
