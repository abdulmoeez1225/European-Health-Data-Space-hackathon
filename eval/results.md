# Evaluation results

Runs per request: 3, cache: off

## Set: main (10 requests)

| Request | Decision | Articles | Decision ok | Numbers | Leaks | Consistent | Slowest (s) |
|---|---|---|---|---|---|---|---|
| R01 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 8.96 |
| R02 | REJECT | 54 | ok | n/a | 0 | ok | 4.87 |
| R03 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 15.05 |
| R04 | REJECT | 54 | ok | n/a | 0 | ok | 4.90 |
| R05 | APPROVE_SPE | 53, 66, 68, 73 | ok | ok | 0 | ok | 11.25 |
| R06 | REJECT | 54 | ok | n/a | 0 | ok | 4.68 |
| R07 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 7.38 |
| R08 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 9.49 |
| R09 | APPROVE_STATISTICAL | 53, 66, 69 | ok | ok | 0 | ok | 16.02 |
| R10 | REJECT | 54 | ok | n/a | 0 | ok | 5.32 |

| Metric | Result | Target |
|---|---|---|
| Correct decisions | 10 of 10 | 10 of 10 |
| Correct numbers | 6 of 6 | 6 of 6 |
| Privacy leaks | 0 | 0 |
| Consistency | 10 of 10 | 10 of 10 |
| Time to answer (slowest) | 16.0 s | Under 60 s |

