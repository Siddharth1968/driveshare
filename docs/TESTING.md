# Testing

Tests use PostgreSQL, not mocked Prisma results or SQLite. The integration and browser suites deliberately reset isolated business data and refuse any database name that does not end in `_test`. Do not point them at your demo or any database you need to preserve.

## Start a database

For native contributors `npm run db:local` creates both `driveshare` and `driveshare_test` on loopback port 5432. Keep it running. Alternatively:

```bash
docker compose -f compose.test.yaml up -d --wait
```

This creates a separate ephemeral test database on loopback port **5433**. Use the corresponding TEST_DATABASE_URL below. The Docker test configuration is supplied; consult TEST_REPORT for whether Docker was executable in the implementation environment.

## Type checks and builds

```bash
npm ci
npm run typecheck
npm run build
```

API generation runs as part of typecheck/build. Vite builds the real React application; this is not a mocked UI test.

## PowerShell: migration and integration tests

For the native helper:

```powershell
$env:TEST_DATABASE_URL="postgresql://driveshare:driveshare_local@127.0.0.1:5432/driveshare_test?schema=public"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm run db:migrate
Remove-Item Env:DATABASE_URL
npm test
```

For the Docker test database substitute port 5433. Removing the temporary DATABASE_URL override lets native development use the root `.env` again. `TEST_DATABASE_URL` affects test configuration only.

## macOS/Linux

```bash
export TEST_DATABASE_URL='postgresql://driveshare:driveshare_local@127.0.0.1:5432/driveshare_test?schema=public'
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm test
```

## Browser tests

```bash
npx playwright install chromium
npm run test:e2e
```

Browser setup deploys migrations and resets/seeds the isolated test database. Playwright starts its own API on 4001 and frontend on 5174; it does not reuse unknown running servers. A single worker keeps shared demo scenarios deterministic. Tests cover landing/search, local-map fallback/selection, registration/vehicle creation, login, real booking/payment failure/retry/confirmation/cancellation, host schedules, administrator approval/dispute controls and mobile viewport behavior.

Do not run integration tests concurrently with browser tests: both intentionally share the selected `_test` database. Keep the ordinary demo on the separate `driveshare` database.

## Test groups

| File               | Verification                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policies.test.ts` | Early/grace/late interval boundaries, cancellation boundary and Kolkata schedule interpretation                                                                                                                        |
| `database.test.ts` | Exactly eight tables, foreign keys, invalid intervals, active overlap rejection, adjacent intervals, nonblocking terminal/wait states, protected history, schedule exclusions, occupancy uniqueness, completed reviews |
| `engine.test.ts`   | Holds, success/failure/retry, key replay, stale holds without cleanup, refunds, fees, wait notices, owner verification, capped/disputed fines, next-driver protection, no-show reversal and inventory/payment races    |
| `security.test.ts` | Registration/admin injection, password/cookie handling, ownership, CSRF/Origin, client amount rejection, suspension, logout invalidation, safe block resolution and parameterized search                               |
| `journeys.spec.ts` | Actual browser journeys against a real database and API                                                                                                                                                                |

Concurrency assertions use simultaneous Promise requests to the real transaction service, with separate transactions sharing the parking-row lock. Races include booking/cancellation, booking/blocking, booking/payment, expired-hold payment/new allocation, repeated payment, waiter acceptance/direct allocation and payment/cancellation.

The clock abstraction freezes exact times for policy and integration tests, removing millisecond drift at grace/interval boundaries. Interactive demo time uses a continuing offset instead, never the browser or operating-system clock.

Additional `workflows.test.ts` cases verify listing/approval lifecycle, preserved booking terms, protected schedules, completed reviews, simultaneous HTTP requests, multi-day blocking, notification reads and production gates.

The committed `scripts/smoke-api.mjs` also checks a fresh demonstration origin end to end: health, seven approved seed spaces, cookie login, a real reservation, simulated payment, cancellation and a balanced refund. Set `SMOKE_URL` to the origin being tested; Docker CI defaults to `http://localhost:8080`. It intentionally makes simulated transactions in the fictional driver4 account.

## Reports and routine maintenance

```bash
npm audit
npx playwright show-report
```

Playwright keeps screenshots/traces on failure in ignored `test-results` and its HTML report in ignored `playwright-report`. Final counts and unverified gates belong in the committed TEST_REPORT rather than invented summaries. If an operation changes, rerun its relevant tests. A test run using the same database must be sequential with other destructive suites.

The PostgreSQL 8.x Node driver may emit a deprecation warning when a Prisma interactive transaction schedules queries concurrently. This is not a failing database result. Domain inventory reads are sequenced on the single transaction client; independent pooled dashboard reads may run in parallel.
