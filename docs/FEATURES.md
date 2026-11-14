# Functional feature inventory

Implementation is distinct from verification. Current execution evidence and environment gaps are in [TEST_REPORT.md](TEST_REPORT.md).

| Area                   | Implemented behavior                                                                                                           | Where to demonstrate            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Public experience      | Responsive landing, local illustrations, search, filters, cards, distance and rating                                           | `/`, `/explore`                 |
| Map                    | Interactive Leaflet markers, card/marker selection, popups, optional attributed tiles, labelled local fallback                 | `/explore`                      |
| Identity               | Registration, bcrypt login, secure-cookie session design, CSRF, logout invalidation, one account with driver/host capabilities | `/register`, `/login`, `/owner` |
| Driver overview        | Upcoming sessions, active occupancy, history, net spending, fines, saved vehicles                                              | `/dashboard`                    |
| Vehicles               | Multiple vehicles, edit, soft remove, ownership enforcement                                                                    | `/vehicles`                     |
| Reservations           | 15-minute–24-hour intervals, server prices, temporary holds, DB-backed conflict prevention, idempotency                        | `/explore/:id`                  |
| Demo checkout          | Demo UPI/Card/Cash, success, failure, retry, cancel payment, explicit no-money banner                                          | `/pay/:id`                      |
| Booking details        | Policy/price/access snapshots, timeline, payment/refund history, arrival request, checkout request, disputes and review        | `/bookings/:id`                 |
| Cancellation           | Free/late/after-start policies; full host/unavailable refund; signed ledger; instant unoccupied release                        | Booking details                 |
| Waitlist               | Nonblocking record, release notifications, explicit new hold attempt, no automatic charge                                      | Booking details, notifications  |
| Host spaces            | Create/edit, local image uploads, prices/types, permission attestation, review gate, pause                                     | `/owner/spots`                  |
| Recurrence             | Zoned weekdays/time windows with effective dates, overlap rejection, existing-booking protection                               | Space availability page         |
| Blocks                 | Inspect affected bookings; explicit cancellations/full refunds before maintenance blocks; remove block                         | Space availability page         |
| Occupancy              | Owner/admin verified entry and exit, arrival window, one occupied vehicle per space                                            | Host booking management         |
| Overstay               | Server-time reminder, provisional/final fine, grace/interval policy snapshot, demo fine payment                                | Booking details                 |
| Disputed checkout      | Driver evidence, host response, capped accumulation, admin resolution; occupancy retained until verified                       | Booking detail / admin disputes |
| Next-driver protection | In-app warning, failed check-in, full-refund choice                                                                            | Seeded next-driver account      |
| No-show                | Arrival reminder, grace, explicit host absence verification, 25% net fee, notice, driver dispute and admin reversal            | Host booking details            |
| Reviews                | Completed own booking only; one rating 1–5; no self-host reviews                                                               | Completed driver booking        |
| Earnings               | Signed successful entries, failed attempts excluded, history filter                                                            | `/owner/earnings`, `/payments`  |
| Administration         | Statistics, listing approve/reject with reasons, users/suspension, all booking/payment monitoring                              | `/admin/*`                      |
| Fine interventions     | Waive/adjust with reason; audit + zero-value adjustment; paid reduction refunds exactly once                                   | Admin disputes/interventions    |
| Demo controls          | Idempotent seed, explicit local reset, predefined scenarios, admin-only clock advance/restore outside production               | Admin overview / CLI            |
| Portability            | npm lockfile, two Dockerfiles, Compose health/start dependencies, migration+seed startup, persistent data/images               | Repository root                 |
| Tests                  | Unit, database, domain, concurrency, security/HTTP and browser journeys using real PostgreSQL                                  | `apps/api/tests`, `tests/e2e`   |

## Final audit gates

- [x] Eight business models, both migration files and SQL safety constraints exist.
- [x] Frontend routes call implemented APIs for public/driver/host/admin actions.
- [x] Ownership, capability and CSRF enforcement are on the server.
- [x] Active overlap exclusion, row locking, unique occupancy and unique successful payment indexes are implemented.
- [x] Payments/refunds/fines are simulated and amounts are server-authoritative.
- [x] Cancellation/block/physical occupancy are distinct and preserve history.
- [x] Waiters receive in-app availability notices and attempt their own new hold.
- [x] Bundled map, seed and local demo controls are implemented.
- [x] Windows/Linux instructions, Mermaid diagrams, policy guide and presentation material exist.
- [ ] Docker startup and fresh Docker clone execution verified on a Docker-equipped machine.

Use the test report for executed pass/fail counts rather than inferring them from this implementation inventory.

## Deliberate external dependencies and limits

Node/npm packages and Docker images need internet on first installation. Map tiles are optional; the supplied default is a clearly fictional local illustration. No actual payments, hardware sensors, outbound verification email, public geocoder or cloud storage are integrated. In-app polling replaces push/email delivery. The demo clock is process-local; horizontally scaled production APIs must use ordinary shared real time and keep demo controls disabled. Large-scale pagination, object storage, log aggregation, backup automation and tamper-evident external audit storage remain deployment concerns.
