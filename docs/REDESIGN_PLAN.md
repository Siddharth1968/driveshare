# Redesign checklist

Branch: `codex/ui-redesign`, based on preserved `main` at `b3069e4`.

- [x] Inspect public, driver, host, admin, authentication, inventory and existing real-database/browser tests.
- [x] Identify date/time loss between search and review, browser-timezone-dependent inputs, absent host payment/cancellation notices, missing visible host IDs, undersized mobile navigation and misleading future availability for non-overlapping current occupants.
- [x] Shared IST interval picker, duration shortcuts and preserved URL interval.
- [x] Search-first home, review and confirmation, profile and notifications, desktop and mobile navigation.
- [x] Sahyadri map reference, fictional nearby seed, OpenStreetMap configuration and offline fallback.
- [x] Host dashboard booking IDs, connected notices and polling.
- [x] Full regression, cross-account browser workflow, responsive screenshots and security audit.
- [x] Demo accounts, five-minute guide, report and branch commit.

Preserve the eight business tables, exclusion constraints, row locks, cookie/CSRF protections, signed refunds, waitlists, occupancy, fines, disputes and administration. Existing booked spaces must not be relocated or deleted. Existing installations receive additive, stable-ID Sahyadri demo listings; a fresh database seeds the same family directly. No deployment or push is authorized by this task.
