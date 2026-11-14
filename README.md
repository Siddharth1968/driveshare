# DriveShare

**A little space. A better city.**

A full-stack peer-to-peer micro-parking demonstration: React, TypeScript, Express, Prisma and PostgreSQL. Drivers reserve fictional neighborhood parking; hosts manage availability and verify physical arrival/departure; administrators review listings and resolve disputes. All payments are simulated.

**DEMO PAYMENT — NO REAL MONEY WILL BE CHARGED**

## Quick start with Docker

Install Git and Docker Desktop with Docker Compose, then run:

```bash
git clone https://github.com/Siddharth1968/driveshare.git
cd driveshare
docker compose up --build -d
```

Open **[http://localhost:8080](http://localhost:8080)**. Startup waits for PostgreSQL, deploys both migrations, seeds fictional accounts if absent, then starts the API and web server. No API keys, cloud accounts or `.env` file are required for the local demo. Database and uploaded images survive container restarts.

The supplied Compose environment is deliberately a **local demo**, bound to loopback. Docker execution evidence and any environment limitations are recorded in [the test report](docs/TEST_REPORT.md). Do not interpret the presence of Dockerfiles as proof that containers were executed.

## Fictional demo accounts

All use **`DriveShareDemo!23`** in the local demo environment only.

| Account     | Email                     | Capabilities                             |
| ----------- | ------------------------- | ---------------------------------------- |
| Aditi Rao   | `admin@driveshare.demo`   | Administrator                            |
| Meera Nair  | `owner@driveshare.demo`   | Driver and host                          |
| Arjun Shah  | `owner2@driveshare.demo`  | Driver and host                          |
| Riya Sharma | `driver@driveshare.demo`  | Driver, overdue session                  |
| Kabir Patel | `driver2@driveshare.demo` | Driver, disputed fine and future booking |
| Ananya Iyer | `driver3@driveshare.demo` | Driver, two-wheeler and waiting entry    |
| Dev Mehta   | `driver4@driveshare.demo` | Driver, protected next reservation       |

Eight fictional parking listings surround Sahyadri College of Engineering & Management in Adyar, Mangaluru. Seven are approved and one awaits review. See the [demo accounts](DEMO_ACCOUNTS.md) and [five-minute demonstration](HOW_TO_DEMONSTRATE_DRIVESHARE.md).

## Native development

Requires Node.js 24 LTS, npm and PostgreSQL 17. For a contributor without PostgreSQL, the optional helper starts an isolated local PostgreSQL cluster; it does not install a system service.

```bash
npm ci
# PowerShell: Copy-Item .env.example .env
# macOS/Linux: cp .env.example .env
npm run db:generate
npm run db:local
```

Keep that terminal open. In a second terminal in the repository:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)**. The API listens on port 4000. Use `localhost` as documented so browser Origin matches `APP_ORIGIN`.

If using an existing PostgreSQL installation, create `driveshare` and `driveshare_test`, set `DATABASE_URL` in `.env`, and skip `db:local`. The database role must be able to install `btree_gist` during migration. The helper's binaries download on first `npm ci`. Booking and the local map illustration work offline after installation, and the live OpenStreetMap basemap needs internet access. The helper is intended for regular non-root users. Docker is the recommended Linux/root setup.

## Verify

```bash
npm run typecheck
npm run build
# Migrate the separate test database; PowerShell syntax:
$env:DATABASE_URL="postgresql://driveshare:driveshare_local@127.0.0.1:5432/driveshare_test?schema=public"
npm run db:migrate
Remove-Item Env:DATABASE_URL
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

Tests refuse to truncate a database whose name does not end in `_test`. Browser tests start their own servers on ports 4001 and 5174. Do not run the integration and browser suites concurrently; both intentionally reset the isolated test database. See [testing instructions](docs/TESTING.md) for macOS/Linux and Docker test database commands.

## What makes reservations safe

- PostgreSQL exclusion constraints reject overlapping active `[start,end)` intervals. Adjacent reservations are allowed.
- Every inventory transaction locks the parking-space row before reading state. Expired holds are retired under this lock before new allocations, even if background cleanup is delayed.
- Physical occupancy is separate from scheduled reservation time. Only verified host/admin checkout releases a parked vehicle. A unique partial index permits one occupied vehicle per space.
- Unique reservation/payment keys and a unique successful-booking-payment index prevent duplicate reservations and demo charges. Amounts come from the API.
- Ledger entries use integer paise, positive credits and negative refunds; zero-value adjustment records preserve administrative interventions without inventing revenue.

## Documentation

| Guide                                            | Contents                                                 |
| ------------------------------------------------ | -------------------------------------------------------- |
| [Project overview](docs/PROJECT_OVERVIEW.md)     | Scope, audience, folder structure and constraints        |
| [Features](docs/FEATURES.md)                     | Implemented workflows and acceptance checklist           |
| [Architecture](docs/ARCHITECTURE.md)             | System, roles, security and API reference                |
| [Database design](docs/DATABASE_DESIGN.md)       | Eight tables, policies, SQL concepts and concurrency     |
| [ER diagram](docs/ER_DIAGRAM.md)                 | All relationships in Mermaid                             |
| [Booking flow](docs/BOOKING_FLOW.md)             | Reservation, payment, cancellation and overstay diagrams |
| [Demo guide](docs/DEMO_GUIDE.md)                 | Seven scenarios, presentation script and viva answers    |
| [Installation](docs/INSTALLATION.md)             | Windows-friendly setup and environment variables         |
| [Troubleshooting](docs/TROUBLESHOOTING.md)       | Logs, port conflicts, reset and common errors            |
| [Testing](docs/TESTING.md)                       | Test isolation and execution commands                    |
| [Redesign verification](docs/REDESIGN_REPORT.md) | Current test results and responsive screenshots          |
| [Original test report](docs/TEST_REPORT.md)      | Historical test results from the initial implementation  |

## Deployment boundary

The repository is designed for reproducible academic demonstrations. A public deployment additionally needs HTTPS, a unique secret, `NODE_ENV=production`, `DEMO_MODE=false`, restricted database credentials, backups and operational review. Production disables seed/reset/clock controls and uses Secure cookies. Email verification delivery, hardware occupancy sensors, real money, cloud storage and push/email notifications are outside this demo's scope. Notifications are durable in-app records and poll while signed in.

This repository retains its original history. Completed work is committed locally; remote pushes require explicit authorization. Never force-push.
