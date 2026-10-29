# Stress findings: where the Gatekeeper answers wrong on unseen requests

Synthetic data only. 29 new requests: S01-S20 are the requested set, S21-S29 are follow-up probes added to confirm that a
root cause generalises. Every request ran twice through `process_request(req, use_cache=False)` (LLM cache off, state in
a temp dir); S01-S08 ran five times in total (2 + 3 extra) for the naming study. Expected answers come from
`eval/stress/reference.py` (hand-written DuckDB SQL). Every numeric reference answer (S01-S08, S12, S17-S22, S24-S27) was
additionally cross-checked with plain Python over the CSVs (no DuckDB, no app code) and matched.

Snapshot tested: git HEAD `0f4aaab` plus the uncommitted working tree (consensus voting with 2-3 plan readings per request,
`plan.unsupported`, keyword safety net in `decide.py`). `backend/pipeline.py`, `planner.py`, `plan.py`, `decide.py`, `compiler.py` and `stats.py` did not
change between the first and the last run (md5 unchanged). If `app/` changed since, re-run `.venv/bin/python -m eval.stress.run_stress`.

## Scores

| Metric | S01-S20 (requested set) | All 29 |
|---|---|---|
| Correct decisions (decision and articles) | 19 of 20 (S17) | 26 of 29 (S17, S26, S27) |
| Correct numbers, approved requests with expected values | 10 of 13 (S05, S12 wrong; S17 wrongly rejected) | 12 of 19 (also S21, S22 wrong; S26, S27 wrongly rejected) |
| Inexpressible requests that were flagged instead of answered | 3 of 3 (S09, S10, S11) | 4 of 4 (also S23); S22 flagged in 3 of 4 runs |
| Privacy leaks (small cell, opt-out, patient id, records in statistics) | 0 | 0 |
| Consistency across 2 runs (`metrics.signature`, includes metric names) | 18 of 20 (S06, S08 differ) | 26 of 29 (also S22) |
| Consistency of the released numbers across the 2 runs | 20 of 20 | 28 of 29 (S22: wrong numbers in one run, flagged in the other). Over five runs S05 flips between two wrong values |
| Slowest request | 30.3 s | 30.3 s |

Passes worth knowing about: all six subtle prohibited purposes (S13-S16, S28, S29) were rejected 12 of 12 times, each by the LLM
alone (the flag reads "without any keyword match"). S18 (list request) and S19 (convenience justification) got statistics, S20 got
an SPE whose row counts match the reference exactly (conditions 854, medications 792, observations 777, encounters 1664, cohort 351),
and "Data access application (Art. 67)" was recognised. S09, S10, S11, S23 produced no numbers and a "Cannot be computed automatically" flag.

## Results per request

Result: PASS = decision and numbers right; safe = flagged, no wrong number; FAIL = wrong decision or wrong/missing number.
"Same in 2 runs" is `metrics.signature` equality, which includes metric names.
Root causes (RC1-RC4) are explained below.

| Id | What it probes | Expected | Got run 1 / run 2 | Numbers | Same in 2 runs | Result | Root cause |
|---|---|---|---|---|---|---|---|
| S01 | prose only, UK English, "older than 75", systolic >= 140, loop diuretic, 4 numbers | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S02 | T2D OR obesity, statin, no codes, % of union | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S03 | region x age band, "under 40" | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S04 | stays by main dx (pneumonia OR UTI) 2024, distinct patients, mean LoS | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S05 | % of all contacts that are emergency (encounter unit) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | WRONG / WRONG | yes | FAIL | RC1 |
| S06 | hospital filter, age bands, HbA1c > 8, share of measured | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | NO | PASS | RC4 |
| S07 | metformin ever vs active, % of ever | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S08 | onset year 2024, two diagnoses, per hospital | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | NO | PASS | RC4 |
| S09 | median BMI (not in DSL) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | none released (flagged) | yes | PASS |  |
| S10 | rate per 1,000 (not in DSL) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | none released (flagged) | yes | PASS |  |
| S11 | mean age (not in DSL) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | none released (flagged) | yes | PASS |  |
| S12 | mean of latest HbA1c measured in 2023 (window on the mean) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | WRONG / WRONG | yes | FAIL | RC3 |
| S13 | insurer "actuarial risk research" (tariffs) | REJECT 54 | REJECT 54 / REJECT 54 | n/a | yes | PASS |  |
| S14 | employer wellness, cross-match personnel file | REJECT 54 | REJECT 54 / REJECT 54 | n/a | yes | PASS |  |
| S15 | pharma "medical education" = sponsored dinners | REJECT 54 | REJECT 54 / REJECT 54 | n/a | yes | PASS |  |
| S16 | spirits brand positioning | REJECT 54 | REJECT 54 / REJECT 54 | n/a | yes | PASS |  |
| S17 | pharmacovigilance by "marketing authorisation holder" (allowed) | STATISTICAL 53,69 | REJECT 54 / REJECT 54 | no stats / no stats | yes | FAIL | RC2 |
| S18 | health data request asking for patient list | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S19 | access application, convenience only | STATISTICAL 53,66,69 | STATISTICAL 53,66,69 / STATISTICAL 53,66,69 | ok / ok | yes | PASS |  |
| S20 | "Data access application (Art. 67)", good SPE justification | SPE 53,66,68,73 | SPE 53,66,68,73 / SPE 53,66,68,73 | ok / ok | yes | PASS |  |
| S21 | 3 main diagnoses side by side per hospital | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | WRONG / WRONG | yes | FAIL | RC1 |
| S22 | metformin at any time during 2024 (overlap) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | WRONG / flagged | NO | FAIL | RC3 |
| S23 | stays per quarter (not in DSL) | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | none released (flagged) | yes | PASS |  |
| S24 | patients with >= 2 inpatient stays | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S25 | hospital x year, visits and distinct patients | STATISTICAL 53,69 | STATISTICAL 53,69 / STATISTICAL 53,69 | ok / ok | yes | PASS |  |
| S26 | trial feasibility, "recruit" (allowed) | STATISTICAL 53,69 | REJECT 54 / REJECT 54 | no stats / no stats | yes | FAIL | RC2 |
| S27 | tobacco-control prevention (allowed) | STATISTICAL 53,69 | REJECT 54 / REJECT 54 | no stats / no stats | yes | FAIL | RC2 |
| S28 | pharma "commercial strategy" field force | REJECT 54 | REJECT 54 / REJECT 54 | n/a | yes | PASS |  |
| S29 | access application linking to app user base | REJECT 54 | REJECT 54 / REJECT 54 | n/a | yes | PASS |  |

Failure categories used below: (a) the DSL cannot express it, (b) the LLM planned it wrong although the DSL can express it, (c) compiler or stats
bug, (d) decision or assessment error, (e) naming or consistency issue, (f) eval-matching issue on my side. No (f) occurred: the "LABELS ONLY" check never fired,
because the requests state their band labels and the planner copied them.

## Failures by root cause, most likely jury hit first

### RC1. Encounter attributes inside a metric are evaluated per patient, not per encounter (S05, S21). Category (c) with (b) as the trigger. Silent wrong numbers.

Hit twice, 4 of 4 runs, no review flag. The jury says it "can filter inpatient stays by main diagnosis or group by hospital", so "share of
stays that are X", "heart failure, pneumonia and hip fracture stays per hospital" and "emergency visits as % of all contacts" are the natural next requests.

- S05 expected 461 / 369 / 272 emergency visits (7.3 % / 6.8 % / 7.2 %). Released across five runs for Klinikum Nord: 1626 (25.8 %) three times and 857 (13.6 %) twice. The 1626 variant is 3.4-3.7 times too high in every hospital (Süd 1351, West 912).
- S21 expected Nord 66 / 39 / 26 (heart failure / pneumonia / hip fracture), released 71 / 41 / 29; Süd 60 / 28 / 27 vs 64 / 29 / 27; West 31 / 24 / 21 vs 38 / 24 / 21.

Cause. With `unit = "encounters"` the plan can only restrict encounters globally (`encounter_filter`). To split by type or diagnosis inside a metric, the LLM writes an
`EncounterCriterion` in `where` / `numerator_where`. Its docstring says "Patient has at least one encounter matching", and `compiler._positive_sql`
(`backend/compiler.py` line 121) compiles it as `(SELECT count(*) FROM encounters x WHERE x.patient_id = p.patient_id AND x.type IN ('emergency')) >= 1`.
Every encounter of every patient who ever had one matching encounter is therefore counted. The LLM's own notes show it believes the criterion filters the row
("an EncounterCriterion to filter the encounter's own type since unit is encounters").

Reproduced without the LLM, hand-built plan for the S21 heart failure column: `{unit: encounters, encounter_filter: {types: [inpatient], start 2025}, group_by: data_holder,
metrics: [count where EncounterCriterion(primary_icd10_prefixes=[I50])]}` gives Nord 73, Süd 67, West 40 (reference 66 / 60 / 31). The generated SQL is the subquery above.

Also seen: S05 plans differ between runs (one adds the 2025 date bounds to the criterion, one does not), so wrong results are also unstable (857 vs 1626), and `consensus` still reports `plan_agreeing 2 of 2`.

Fix.
1. `backend/compiler.py`: pass the plan unit into `criterion_sql`. For `unit == "encounters"` compile an `EncounterCriterion` as a row predicate on the unit encounter:
   `e.type IN (...) AND e.primary_icd10 LIKE ... AND e.start_date BETWEEN ...` (`_encounter_conditions("e", ...)` already builds this); ignore `min_count`, or reject `min_count > 1` in that mode.
   For `unit == "patients"` keep the current meaning. This matches what the model already intends, and it makes S05 (461 / 6313) and S21 correct with the plans the model produces today.
2. `backend/plan.py`: change the `EncounterCriterion` docstring to state both meanings.
3. `backend/planner.py` prompt: "For stays and visits, split or take a share by type, diagnosis or date with an EncounterCriterion in the metric's where; it applies to the stay itself."
4. Until that lands, a guard in `plan.py` or `pipeline.py` that sets `unsupported` for an `EncounterCriterion` inside a metric of an encounter-unit plan turns silent wrong numbers into a staff flag.
5. Add S05 and S21 as regression tests with the reference values.

### RC2. The keyword safety net overrides a correct LLM judgement and rejects allowed requests (S17, S26, S27). Category (d). Wrong decision.

Hit 3 times, 6 of 6 runs. In all six runs the LLM readings (2 of 2 agreeing) said "not prohibited"; the flag reads
"Prohibited-use keywords found (marketing) but the AI judged the purpose allowed; rejected pending staff review."

| Request | Allowed purpose | Word that forced REJECT |
|---|---|---|
| S17 | post-authorisation drug-safety study by a pharma company | "marketing authorisation holder" matched `marketing` |
| S26 | clinical trial feasibility | "recruit trial sites" matched `recruit` |
| S27 | non-profit tobacco-control prevention evidence | "tobacco control" matched `tobacco` |

Reproduced offline with `backend.decide.keyword_hits` (no LLM): purposes containing "premium-class wards", "hospital employees" (occupational health, an allowed Art. 53 purpose), "loan of devices", "hiring needs for nurses", "military hospital quality",
"advertising ban evaluation" and "tobacco control policy" all trigger a hit. Against that, the net added nothing on my set: S13-S16, S28 and S29 were rejected by the LLM alone in 12 of 12 runs, and
the three false rejections were wrong. The applicant also gets a wrong reason ("Health data may not be used for advertising or marketing") for a pharmacovigilance study. Decisions are the first metric (10 of 10 target), so each false rejection costs as much as a missed prohibited request.

Fix.
1. `backend/decide.py` line 153: when `llm_used` and the assessment says allowed, keep the LLM decision and only append the existing review flag (staff see "keyword X found, AI judged allowed"). Keep the hard keyword rejection only for the no-LLM fallback (`not llm_used`).
2. `backend/pipeline.py` line 206: change `if assessment.prohibited or keyword_hits(request)` to `if assessment.prohibited`; otherwise the plan is never computed for these requests and S17/S26/S27 would be approved without numbers.
3. If a safety net is still wanted, make it a second LLM question with the matched words ("is `marketing` used here as a prohibited purpose?") and reject only if the consensus agrees, or at least exclude fixed phrases (`marketing authori[sz]ation`, `tobacco control|cessation`, `recruit(ment)? of (trial )?(sites|participants)`, `premium (ward|class)`).

### RC3. A measurement window or a prescription period cannot be expressed, and the model approximates without saying so (S12, S22). Category (a), with (b) in S22. Silent wrong numbers.

- S12, mean of each patient's latest HbA1c measured in 2023, per sex: expected women 7.1, men 7.3 (n 296 / 312). Released women 7.2, men 7.1 in 2 of 2 runs, no flag. `ObservationCriterion.date_from/date_to` restricts the cohort, but `MeanMetric` has no date range, so the mean uses the patient's overall latest value. Reproduced without the LLM: the best-effort DSL plan (cohort E11 plus a 2023 HbA1c criterion, mean latest) yields 7.2 / 7.1. The plan notes say the model believed the window also applied to the mean ("latest value within that window used for both the cohort filter and the mean"). My first S12 variant used 2024; there the error rounds away (7.2 / 7.2 either way) which is why I moved it to 2023.
- S22, patients on metformin at any time during 2024, per sex: expected 393 / 388. `MedicationCriterion` has `active_on` (one day) and `started_from/to`, not an overlap. Of four runs, three set `unsupported` and flagged it correctly; one released 425 / 414 under the label "patients on metformin at any time during 2024". That plan used `started_to = 2024-12-31` and the model wrote in `plan.notes`: "approximates ... may slightly overcount", yet `plan.unsupported` stayed null and nothing reached the review flags.

Fix.
1. `backend/plan.py` / `backend/compiler.py`: add `date_from` / `date_to` to `MeanMetric` and pass them as `extra` to `_latest_value` (the helper already takes `extra`). Add `overlaps_from` / `overlaps_to` to `MedicationCriterion`
   (`m.start_date <= overlaps_to AND (m.end_date IS NULL OR m.end_date >= overlaps_from)`).
2. `backend/planner.py` prompt: "If a definition can only be approximated, do not approximate: set `unsupported`."
3. `backend/pipeline.py`: if a note matches `approximat|overcount|undercount|cannot be expressed|not exactly`, treat the plan as unsupported (flag and withhold). That alone would have caught S22 run 1.

### RC4. Metric names are unstable when no definition starts with "Report ...:", and a name can mislead (S06, S08, and S01-S04 in the five-run study). Category (e). Numbers are right; names and the metric set differ between runs.

`planner.report_phrases` only reads a definition that starts with "report" and contains ":". The five-run study (3 extra runs plus the 2 original runs) on the requests that lack such a line:

| Request | Distinct metric-name sets over 5 runs | Distinct value sets |
|---|---|---|
| S01 | 4 (`latest_systolic_blood_pressure_140_or_higher`, `latest_systolic_bp_140_or_higher`, `latest_systolic_at_or_above_140`, ...) | 1 |
| S02 | 2 | 1 |
| S03 | 2 (`people_with_obesity` vs `patients`) | 1 |
| S04 | 2 | 1 |
| S06 | 3 | 1 |
| S08 | 4 | 2 |
| S05, S07 (they have a "Report per ..." line) | 1 | S07 1, S05 2 (RC1) |

So six of six requests without a Report line change names between runs, against none of the two requests that have one (S05, S07). Two of them are more than cosmetic. In S08 run 1 the metric holding the number of newly diagnosed depression patients (30) was named `patients`,
and in S08 run 3 the model added an unrequested population metric `patients` (7721 per Nord), both caused by the prompt rule "The group population itself is a CountMetric with no where". A reader or a jury script matching on the name `patients` gets the wrong figure.
If the jury's definitions follow the R/H style ("Report per X: ...") this stays hidden, which is why it ranks below RC1 and RC2; the strict consistency metric (3 runs) fails on it as soon as one request lacks that line.

Also found in `report_phrases` (reproduced offline on S10): the comma split breaks "per 1,000" into the phrases "heart failure patients per 1" and "000 patients". It only bites when that count happens to equal the number of metrics.

Fix.
1. `backend/planner.py`: accept any definition that has a "per X:" / "for each X:" / "give ...:" list, not only one starting with "Report", and split on commas that are not between digits (`(?<!\d),|,(?!\d{3})`).
2. Drop the "group population is a CountMetric with no where" rule unless the report asks for the population, and forbid a bare `patients` name on a metric that has a `where`.
3. When no phrase list exists, derive the name deterministically from the plan (kind, codes, comparator) instead of the model's free text.

## Not wrong, but worth knowing

- `plan.unsupported` works: S09, S10, S11, S23 were flagged in 8 of 8 runs and S22 in 3 of 4. The flag text is accurate and tells staff what to prepare. The weak spot is only the cases where the model does not recognise a gap (RC1, RC3).
- `plan.spe_records` is filled for statistics-only requests (S18, S19) although the prompt says health data requests never need it. No effect on the decision or on the released numbers.
- `consensus` agreement ("2 of 2") compares releases, so it cannot flag S05, where every reading is wrong in a different way. The proper cure is RC1.
- The small-cell rule, opt-out handling, rounding and "every group shown" held in all runs: 0 leaks, 27 groups listed for S03, `<10` / `suppressed` matched the reference at the boundary (S19 women COPD `<10` next to men 12, S06 under-50 `<10` with a suppressed share, S18 `<10` and `suppressed` in all three hospitals).

## How to reproduce

```
.venv/bin/python -m eval.stress.reference                       # expected.json
.venv/bin/python -m eval.stress.run_stress                      # all 29 twice -> results.json
.venv/bin/python -m eval.stress.run_stress --only S05,S21 --runs 3
```

`results.json` holds, per request and run: decision, articles, assessment, review flags, plan, SQL and released answer. The five-run naming study and the offline reproductions
(hand-built plans for S05, S12, S21; `keyword_hits` and `report_phrases` calls) are described above and use only public functions of `app/`.

## Status after fixes (re-run with the LLM cache off)

All four root causes were fixed and covered by regression tests (`tests/test_compiler_regressions.py`, `tests/test_planner.py`):

| Root cause | Fix |
|---|---|
| RC1 stay filters counted per patient | `EncounterCriterion` in an encounter-unit plan now filters the counted stay itself |
| RC2 keyword net overrode the AI | With AI readings, keyword hits only add a staff review flag; keywords decide only in the no-LLM fallback |
| RC3 silent approximation | `MeanMetric.date_from/date_to`, `MedicationCriterion.overlaps_from/overlaps_to`; a plan whose notes admit approximating is treated as unsupported |
| RC4 unstable names | Metric names come from any "per X:" / "for each X:" / "Report …:" list; digit commas are not split; no unrequested population counts |

Result on S01–S29: decisions 29/29, numbers correct on every approved request, the four inexpressible requests (S09, S10, S11, S23) flagged with no numbers released, 0 leaks, slowest 30.8 s.
