# Implementation plan and acceptance checklist

This repository is the sole DriveShare source of truth. No replacement GitHub repository or hosted Site is created.

## Architecture decisions

- `apps/api`: Express/TypeScript, Zod, Prisma, PostgreSQL migrations, domain services and real-database tests.
- `apps/web`: React/TypeScript/Vite, Tailwind, Router, Query, Hook Form, Zod, Leaflet and Lucide.
- `docs`: policies, diagrams, installation, presentation and verification evidence.
- `scripts`: isolated local PostgreSQL helper for contributors; Docker remains the recommended installation.
- Exactly eight business tables; sessions are signed, expiring cookies. Disputes, notifications and audit events live in JSON fields on the relevant business record.
- Money is integer paise. Booking timestamps are `timestamptz`; recurring schedules use each spot's IANA time zone.
- Every operation changing inventory locks the parking row first. Exclusion constraints protect active half-open reservation ranges. Expired holds are retired under this lock before allocation, independent of a cleanup worker.
- Scheduled reservation and physical occupancy are separate. A partial unique index permits at most one physically occupied booking per spot. Occupancy persists after scheduled end until owner/admin verification.
- Payment requests, reservations and ledger entries have unique idempotency keys. Amounts and policies are snapshotted and computed on the server.
- Demo clock changes are process-local, forbidden in production, and admin-only. Tests inject a clock without changing operating-system time.

## Execution order

1. [x] Inspect repository and define architecture, risks and checklist.
2. [x] Schema, migration, constraints, booking engine and PostgreSQL concurrency tests.
3. [x] Authentication, ownership, parking, schedules, booking, payment, refund, fine and admin APIs.
4. [x] Responsive frontend and driver/owner/admin workflows.
5. [x] Docker configuration, repeatable seed, offline map and demo scenarios implemented. Docker execution remains environment-blocked.
6. [x] Type checks, production builds, real PostgreSQL integration/security/concurrency and Playwright journeys.
7. [x] Clean local-clone/native installation, compiled-app smoke/browser check, explicit reset/reseed, documentation audit, execution report and local Git commits. Docker execution remains unverified because Docker is not installed.

## Risks to verify

Cross-table booking/block races, stale holds, payment/cancellation races, idempotency replay payloads, false no-shows, disputed checkout accumulation, edits to confirmed listing terms, signed refund accounting, and production-only gates all require server-side enforcement.
