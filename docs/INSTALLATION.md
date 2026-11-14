# Installation

## Windows: recommended Docker route

1. Install [Git for Windows](https://git-scm.com/downloads/win) and [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Follow Docker's current Windows/WSL requirements, enable virtualization/WSL when its installer requests it, and restart if requested.
2. Start Docker Desktop and wait for the engine to be running. In PowerShell, check `git --version`, `docker --version` and `docker compose version`.
3. Clone the existing official repository and start it:

```powershell
git clone https://github.com/Siddharth1968/driveshare.git
Set-Location driveshare
docker compose up --build -d
docker compose ps
docker compose logs api
```

4. Open [http://localhost:8080](http://localhost:8080). Use the fictional accounts in README.

Startup order is PostgreSQL health → API migration/seed/health → web health. Migrations run in the API entry command; they are not an assumption about Compose. The seed skips when the fictional admin already exists, preserving local changes across restarts.

Only the web port is published, bound to `127.0.0.1`. PostgreSQL and the API stay inside the Compose network. Named volumes preserve database records and uploads. The stack intentionally runs the built API in non-production demo mode; do not expose this default environment publicly.

## Native Node development (Windows)

Use Node.js 24 LTS. From the repository:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:local
```

Do not overwrite an existing `.env`; inspect its purpose first. The helper downloads platform-specific PostgreSQL binaries through the public npm dependency, initializes `.local/postgres`, and creates `driveshare`/`driveshare_test`. It binds to loopback and does not register a service. Keep the terminal open.

In another terminal:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` and `/uploads` to port 4000. The root `.env` is loaded by API configuration and Prisma configuration; no duplicate credentials file inside `apps/api` is required.

If PostgreSQL is already installed, create those two databases with a suitable local user and configure `.env`. `btree_gist` must be available. Skip `db:local` if another server already occupies port 5432.

On macOS/Linux use `cp .env.example .env`; the remaining npm commands are the same. Run the optional PostgreSQL helper as a regular user. It deliberately does not enable its library's system-user-creation option; root-based environments should use Docker.

## Configuration

| Variable                           | Meaning                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | PostgreSQL connection. Native `.env` only; Compose supplies its internal `db` address                 |
| `POSTGRES_PASSWORD`                | Optional Compose database password override; local demo default is documented                         |
| `SESSION_SECRET`                   | Minimum 32-character unique secret for production; use cryptographically random bytes                 |
| `NODE_ENV`                         | Production enables Secure cookies and rejects the demo secret                                         |
| `DEMO_MODE`                        | Seed and interactive clock controls require true **and** non-production                               |
| `APP_ORIGIN`                       | Exact browser origin, including port; native `http://localhost:5173`, Compose `http://localhost:8080` |
| `WEB_PORT`                         | Compose host port, default 8080; Compose adjusts APP_ORIGIN automatically                             |
| `PORT`                             | API listen port, default 4000                                                                         |
| `HOLD_MINUTES`                     | Hold lifetime, default 5                                                                              |
| `GRACE_MINUTES`                    | Overstay grace, default 10                                                                            |
| `FINE_INTERVAL_MINUTES`            | Started interval after grace, default 15                                                              |
| `FINE_INTERVAL_RUPEES`             | Charge per started interval, default 20                                                               |
| `NO_SHOW_GRACE_MINUTES`            | Arrival grace before a verified no-show report, default 30                                            |
| `FREE_CANCELLATION_MINUTES`        | Free-cancellation lead time, default 60; snapshotted per booking                                      |
| `LATE_CANCELLATION_PERCENT`        | Fee within the free-cancellation boundary, default 10                                                 |
| `AFTER_START_CANCELLATION_PERCENT` | Unoccupied after-start fee, default 25                                                                |
| `VITE_TILE_URL`                    | Optional approved tile URL template. Blank uses OpenStreetMap.                                        |
| `VITE_TILE_ATTRIBUTION`            | Provider-required attribution; set when enabling external tiles                                       |
| `TEST_DATABASE_URL`                | Separate integration/browser database ending in `_test`                                               |

Fine policy values are snapshotted into new bookings. Changing configuration does not retroactively change a reservation's fine policy. `VITE_*` values are build-time frontend values and never hold secrets. Native Vite reads `apps/web/.env.local` (ignored) or variables in the launching shell; Docker forwards the root `.env` tile variables as build arguments. Rebuild the frontend after changing tiles.

Leaflet requests OpenStreetMap tiles by default with visible attribution. To use a different tile provider, set its URL and attribution and follow its caching, request and offline rules. Tile failure switches to the local illustration with the same parking markers. Location search uses city, area and address fields in the database. [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Stop and reset

```powershell
docker compose down
```

This preserves volumes. To reset only seeded business data, explicitly stop/reset/seed/start the API:

```powershell
docker compose stop api web
docker compose run --rm --no-deps api npm run db:reset -- --confirm
docker compose run --rm --no-deps api npm run db:seed
docker compose up -d
```

For native demo reset, stop the API and run `npm run db:reset -- --confirm`, then `npm run db:seed` and restart the API. This is destructive **only to the database configured in that demo process**. Inspect DATABASE_URL first. Production refuses reset even with the flag. Uploaded files are not deleted by a business-data reset; retained demo files can be managed separately.

## Public deployment prerequisites

Use HTTPS and a unique 32+ character secret, disable demo mode, set production and exact APP_ORIGIN, provision administrators through a trusted process, use a restricted application DB role after migrations, configure backups, persistent storage and monitoring, and verify all Docker quality gates on the target platform. Production session cookies require HTTPS. The default Compose file is intentionally not a public-production deployment profile.
