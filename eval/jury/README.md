# Jury simulator

The jury "also tests new requests on the same data". The other sets (`requests/`, `eval/hidden/`, `eval/stress/`) are fixed and the app has been tuned on them. The simulator writes **new** jury-style requests every time, sends them to a running Gatekeeper **over HTTP**, the way a juror uses the demo, and scores them against answers it computes itself.

```bash
make run                                                 # in one terminal: the app on http://localhost:8000
make jury                                                # 20 new requests × 3 runs, attacks, report
.venv/bin/python -m eval.jury.run_jury --count 10 --runs 1     # quicker
.venv/bin/python -m eval.jury.run_jury --seed 123456           # repeat an earlier set exactly
.venv/bin/python -m eval.jury.run_jury --families stays,spe    # only some families
make jury-live                                           # the deployed site, with its live model (asks first)
```

On Windows use `.venv\Scripts\python.exe` instead of `.venv/bin/python`.

Each run writes `eval/jury/runs/<time>-seed<N>/` (git-ignored) with the requests, `expected.json`, `report.md` and `results.json`, which holds every raw answer. The exit code is 0 only if everything passes, so the simulator can gate a deploy.

## What it checks

**The brief's five metrics on new requests:** correct decisions and articles, correct numbers under every group, privacy leaks, consistency across runs and the slowest answer. Scoring uses `eval/metrics.py`, the same code as `make eval`.

It also checks:

- **Leaks found by comparing with the true answer:** a number shown where the true value is below 10 (or a percentage or mean that must be hidden), and numbers that only match an answer that still includes opted-out patients.
- **Secure workspaces, from outside:** the download returns 403; the workspace holds exactly the selected patients, no opted-out patients, only the record types the request names and all of their rows. These are checked through the workspace console, as a researcher would.
- **Attacks on a workspace:** writes, deletes, a second statement, `COPY` to a file, `ATTACH`, reading the hospital CSVs, installing an extension. The workspace must refuse all of them and stay unchanged. The airlock must refuse patient-level rows and hide groups below 10.
- **A differencing attack:** one applicant asks for "adults with X per region", then "adults aged N+ with X per region", where the two differ by 1–9 patients in some regions. The second answer must be withheld there.
- **Decision letters:** a plain-language reason, an explanation for every cited article, and the decision visible in the staff view.
- **Bad input:** a malformed request gets 422, and a download from an unknown workspace is refused.

When numbers are wrong, the report says which kind of failure it is. "Nothing released, flagged for staff" is a safe failure. "Values right, group labels differ" means the app needs to label its groups differently. "Wrong values released" is the one that loses points.

## Request families

| Family | What a juror would ask | Expected |
|---|---|---|
| `prevalence` | Patients/adults/65+ with a condition and the prevalence, per region, hospital, sex, age band or hospital × sex | Statistics, Art. 53, 69 |
| `treatment` | Patients with a condition and how many have (or do not have) an active drug on 31 Dec 2025 | Statistics, Art. 53, 69 |
| `lab_mean` | Mean of the latest HbA1c, BMI, systolic BP or eGFR | Statistics, Art. 53, 69 |
| `lab_threshold` | Latest value above or below a threshold, and the share | Statistics, Art. 53, 69 |
| `stays` | Inpatient stays by **main diagnosis** (`primary_icd10`), per **hospital of the stay** (`data_holder`), region, sex, age band or year; mean length of stay or distinct patients | Statistics, Art. 53, 69 |
| `visits` | Emergency or outpatient visits and distinct patients, per hospital, region, sex or year | Statistics, Art. 53, 69 |
| `spe` | Access application that explains why records are needed (model training, target-trial emulation) | Secure workspace, Art. 53, 66, 68, 73 |
| `access_statistics` | Access application for records that statistics can answer | Statistics instead, Art. 53, 66, 69 |
| `prohibited` | Insurance pricing, credit, recruitment screening, sales targeting, advertising, nicotine products, council-housing waiting lists; several without the obvious keywords | Refused, Art. 54 |
| `decoy` | Allowed purposes worded with words linked to prohibited uses (tobacco control, a marketing authorisation holder's safety study, alcohol prevention) | Statistics, Art. 53, 69 |

Wording varies within a family. Definitions give the code or only the plain-English term ("any diagnosis of asthma"), which tests the terminology mapping. Thresholds are worded "above", "or higher" or "below".

## Why the expected answers can be trusted

- `reference.py` loads the CSVs into its **own** DuckDB database, with its own opt-out filter, age rule and small-cell rule (Decimal, halves up). It does not import `backend/`, so a bug in the app cannot hide in the expected answers. A test checks that it agrees with the app's views and with the hand-written answer to H04.
- Every requested group is in the expected answer, even if empty (`<10`).
- If a drawn request's answer would depend on how the brief is read, it is discarded and another is drawn. Example: a mean length of stay over 12 stays of only 9 patients. So is a request where every value is hidden.
- Each request has its own organisation, so the release ledger of one request cannot withhold another's numbers. Each repeat run uses another applicant name from that organisation, so the app's LLM cache cannot answer it, and consistency measures fresh readings. The report shows how many answers came from the cache; normally none.

## The corpus

Every request the simulator draws and every result it scores goes into one DuckDB file, `eval/jury/corpus.duckdb`. It has four tables:

- `requests`: request JSON, expected answer and coverage tags
- `runs`: target, LLM backend, date
- `results`: one row per request per run
- `probes`

Requests are stored once, by content. The corpus can be filled in advance and evaluated in chunks:

```bash
make jury-corpus                                  # add 1,000 distinct requests (about 25 s, no LLM, no app needed)
make jury JURY="--from-corpus 200 --runs 1"       # evaluate 200 not yet evaluated on this app and backend
make jury-summary                                 # coverage and results → eval/jury/CORPUS.md
```

`CORPUS.md` reports:

- how many requests there are per family, applicant type, purpose category and wording
- coverage against the data: conditions, drug classes, lab tests, main diagnoses and encounter types found in the CSVs
- coverage against the law: allowed purposes (Art. 53) and prohibited uses (Art. 54)
- results per target and backend, per family, and the latest failures
- a suggested sentence for a slide, built from the real numbers

It also says what the corpus does not show. The requests come from 10 templates with randomised parameters and wording, so they cover the data and the categories of the law, not every way a request can be phrased. Results also hold only for the backend that was measured.

To query it directly: `duckdb eval/jury/corpus.duckdb "SELECT family, count(*) FROM requests GROUP BY 1"`, or open it in any DuckDB client.

## Side effects

The app stores everything it is sent: the requests appear in its decision queue, release ledger and audit log, with ids starting `JS-`. Against a local app this is harmless; to keep your own `state/` clean, start the app with `GATEKEEPER_STATE_DIR` and `GATEKEEPER_CACHE_DIR` pointing to a scratch folder. Against the live site (`--live`) the simulator asks first. Clear the server's `state/` volume before judging if you do not want the test requests in the demo's queue. A full live run also uses the free-tier LLM quota: about 20 × 3 requests with several model calls each.
