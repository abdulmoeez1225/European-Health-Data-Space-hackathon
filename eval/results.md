# Evaluation results

Runs per request: 3, cache: off

## Set: main (10 requests)

| Request | Decision | Articles | Decision ok | Numbers | Leaks | Consistent | Slowest (s) |
|---|---|---|---|---|---|---|---|
| R01 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 9.19 |
| R02 | REJECT | 54 | ok | n/a | 0 | ok | 5.35 |
| R03 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 14.28 |
| R04 | REJECT | 54 | ok | n/a | 0 | ok | 5.07 |
| R05 | APPROVE_SPE | 53, 66, 68, 73 | ok | ok | 0 | ok | 11.69 |
| R06 | REJECT | 54 | ok | n/a | 0 | ok | 6.17 |
| R07 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 6.58 |
| R08 | APPROVE_STATISTICAL | 53, 69 | ok | ok | 0 | ok | 9.43 |
| R09 | APPROVE_STATISTICAL | 53, 66, 69 | ok | ok | 0 | ok | 15.50 |
| R10 | REJECT | 54 | ok | n/a | 0 | ok | 6.27 |

| Metric | Result | Target |
|---|---|---|
| Correct decisions | 10 of 10 | 10 of 10 |
| Correct numbers | 6 of 6 | 6 of 6 |
| Privacy leaks | 0 | 0 |
| Consistency | 10 of 10 | 10 of 10 |
| Time to answer (slowest) | 15.5 s | Under 60 s |

