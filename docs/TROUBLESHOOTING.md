# Troubleshooting

## Docker is not available

`docker` not recognized means Docker Desktop/CLI is absent from PATH. Install and start it using the official Windows guide linked in INSTALLATION, or use the native Node/PostgreSQL route. If the CLI exists but cannot connect, wait for Docker Desktop's engine and check its own diagnostics. DriveShare does not install host virtualization or Docker on your behalf.

## Initial startup takes time

The first build downloads images and public npm packages. Use:

```bash
docker compose ps
docker compose logs db
docker compose logs api
docker compose logs web
```

API health remains unavailable until PostgreSQL, migrations and seeding complete. A failed migration prevents the API from starting. Correct the cause before retrying; never delete or edit already applied migration history to bypass a safety rule.

## Port conflicts

Compose publishes port 8080 only. In PowerShell set `$env:WEB_PORT="8081"`, then `docker compose up --build -d` and open `http://localhost:8081`. Compose updates APP_ORIGIN from the same value. Native development uses 5173, 4000 and 5432; check `Get-NetTCPConnection -State Listen` before changing ports. If another PostgreSQL is listening, use that installation with a separate database instead of starting a competing helper.

Browser tests need ports 5174/4001. They deliberately refuse to reuse unknown servers. Shut down old test processes from your previous run if those ports are occupied. Do not stop unrelated processes merely to free a port.

## Security token or untrusted Origin errors

Open the exact documented hostname/port (`localhost`, not an alternate hostname). Check APP_ORIGIN. Refresh after a server secret change, account suspension/restore or session invalidation, then log in again. Never disable CSRF or Origin checks to fix a local URL mismatch. Production Secure cookies do not work over plain HTTP; use HTTPS or the non-production local demo.

## Space unavailable even though scheduled end passed

An overdue vehicle is still physically parked until the host/admin verifies departure. This is intentional. The next driver sees a warning and may cancel for a full refund. A driver requesting checkout does not release the bay. Use the host reservation details to confirm verified departure or raise/resolve a contested checkout.

## Hold expired

The five-minute hold expired before successful payment. Create a new reservation. A background cleanup delay cannot keep it blocking a new allocation: the allocation transaction retires stale holds under the parking-row lock. A failed demo payment retains only the original deadline; it does not extend the hold.

## Blocking a reserved interval

The first block attempt displays affected booking IDs. Inspect the reservations, then explicitly confirm cancellations/full refunds. If the set changes, review the new set. An occupied vehicle must check out physically before an overlapping interval can be blocked.

## Listing missing from search

The listing needs active status, confirmed hosting permission, an active host account and administrator approval. Any edit returns it to review. Booking also requires recurring windows covering the full requested interval and a supported vehicle type. Check your date filters, city/area query and price limit.

## Map looks illustrated / tiles fail

The local map is the default, clearly labelled fictional campus illustration. This is intentional and does not affect booking. When configured external tiles fail, the same fallback activates. The list and local coordinates remain available. No unrestricted public tile service is assumed.

## Demo clock and reset

Admin overview advances a process-local clock by 35 minutes and restores real time. Restarting the API restores real time too. Resetting demo business data is an explicit CLI action described in INSTALLATION. Do not run reset against a database you need to preserve. Integration/browser test resets are guarded to require `_test` database names.

## npm installation or Prisma errors

Use Node 24 LTS and `npm ci` with the committed lockfile. Keep packages publicly reachable during installation. Run `npm run db:generate` if the generated Prisma client is absent. `npm run db:migrate` reads the root `.env` through Prisma configuration. Do not substitute SQLite or `prisma db push`: they cannot reproduce PostgreSQL range exclusions and the handwritten safety migration.

On Windows prefer a short, writable directory if antivirus or sync software locks generated native binaries. Do not delete user documents to solve build errors. The optional local PostgreSQL cluster and generated reports are inside ignored directories; inspect and stop owned processes before changing any generated runtime files.
