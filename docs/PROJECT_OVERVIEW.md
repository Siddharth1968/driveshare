# Project overview

DriveShare connects an unused private parking bay with a driver who needs it for a short interval. A host lists a space and recurring availability, an administrator approves it, and a driver reserves and completes an explicitly simulated payment. The host verifies physical arrival and departure. Disputes let an administrator resolve delayed confirmations, incorrect no-show reports and unfair fines.

The demonstration prioritizes reproducibility and reservation correctness. There are no mandatory cloud services, paid maps, financial services or unpublished packages. Installation requires network access for public packages/container images. The bundled map and images work offline after installation.

## Repository layout

```text
apps/api/
  prisma/schema.prisma       Eight business models
  prisma/migrations/         Generated schema plus PostgreSQL-specific safety SQL
  prisma/seed.ts             Idempotent fictional demonstration seed
  src/engine.ts              Inventory, payments, cancellations and occupancy
  src/policies.ts            Testable time, fine and cancellation rules
  src/app.ts                 Validated REST routes and error responses
  src/auth.ts                Signed cookie sessions, CSRF and permissions
  tests/                     Real PostgreSQL and HTTP verification
apps/web/
  src/public.tsx             Landing, discovery, registration and reservation
  src/driver.tsx             Driver workspace, vehicles, checkout and history
  src/owner.tsx              Host workspace, listings and availability
  src/admin.tsx              Reviews, suspensions and dispute resolutions
  src/Map.tsx                Leaflet, optional tiles and local fallback
  public/demo/               Original local SVG illustrations
scripts/                     Local PostgreSQL and isolated browser-test setup
tests/e2e/                   Playwright browser journeys
docs/                        Student-facing explanations and audit evidence
```

## Scope and limitations

- One listing represents one physical bay. Multiple bays need separate listings.
- Reservations last 15 minutes to 24 hours, starting within the next year. Availability can span contiguous daily windows; all timestamps retain their time zone meaning.
- Owner/admin verification is the source of physical occupancy truth. Software cannot sense a parked car. This limitation is stated in the UI.
- A driver may request arrival, but cannot self-verify entry or departure.
- Driver and owner are capabilities on one account. Registration cannot grant ADMIN.
- Account/listing removal is suspension or deactivation. Historical booking/payment records are retained by restrictive foreign keys.
- Notifications are in-app and polled every 15 seconds. The most recent 200 durable notices are retained per user. Upcoming checkout and occupied-space warnings are also computed from live booking state.
- No extra operational tables: cookie sessions are cryptographically signed; disputes/audits live on business records; notifications live on users.
- The supplied Compose stack is a local demonstration, not a turnkey internet production environment. See the test report for what was actually executed.

## Engineering priorities

Database constraints are the last line of defense; API transactions serialize inventory changes before making decisions. A polished interface does not replace these guarantees. Payment and reservation status never substitute for physical occupancy, and refunds are accounting entries rather than a call to an external gateway.
