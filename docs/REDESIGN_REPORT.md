# DriveShare redesign verification

The redesign runs on the existing DriveShare repository branch `codex/ui-redesign`. The original `main` remains at `b3069e4`. Local verification used native Windows services, Node.js, a real PostgreSQL database and Playwright Chromium.

## Workflows and fixes

- **Driver:** Find Parking opens directly to search. Separate date and 24-hour time controls use IST. Duration shortcuts update checkout, which remains editable. Search, review and confirmation carry the same interval, and the server validates availability and prices the final reservation. One action runs the simulated checkout and shows the full booking ID. Mobile navigation exposes Find Parking, My Bookings, Notifications and Profile.
- **Host:** Summary cards show parking inventory, upcoming and active bookings, and net simulated earnings. Each booking card and detail page shows the ID and driver. The host can open its saved terms, verify arrival or departure and manage listing availability. Booking cards and notifications poll every five seconds. Confirmation and cancellation notices persist in PostgreSQL.
- **Database:** All eight business tables and the original migration history remain. The regression suite covers role checks, simultaneous reservations and overlap rejection, rollback, idempotent simulated payments, refunds, waiting entries, verified occupancy, overstay fines, disputes and administrator controls.
- **Corrections:** Search previously dropped the selected interval when moving to review, date handling depended on the browser timezone, host records lacked visible full IDs and matching notices, and current occupancy hid some future nonoverlapping reservations. Browser review also exposed a stale Leaflet callback during filtering and a map that stayed visible in mobile list mode. The regression tests check these paths.

## Map and seed

The reference marker is **12.867571, 74.925072** at Sahyadri College of Engineering & Management, Adyar. The campus contact page supplies the coordinates, and the point falls inside the mapped campus boundary. The seven approved fictional parking markers are about **0.15–0.45 km** from the reference point. A fresh demo database also has one pending listing. Reseeding an existing database retains older spaces and booking history and adds missing campus fixtures by stable ID. [Official college contact page](https://www.sahyadri.edu.in/contact), [OpenStreetMap campus boundary](https://api.openstreetmap.org/api/0.6/way/170211469/full).

Leaflet uses the OpenStreetMap basemap with attribution when tiles are reachable. Browser tests intercept tile requests to exercise failure, offline marker selection, and successful recovery without requesting public tiles. The external basemap could not be visually confirmed in the in-app preview, which timed out. A local illustration keeps marker interactions and booking available when tiles fail. No Google Maps JavaScript or Places key was available. The separate **Open in Google Maps** directions link uses the coordinates and works without an API key. [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [Google Maps directions URL documentation](https://developers.google.com/maps/documentation/urls/get-started).

## Automated results

- `npm run check` passed type checking, the production build and **92 tests across 6 files**, with **0 failures**.
- `npm run test:e2e` passed **12 Chromium tests**, with **0 failures** in the final run. It covers search, IST controls and date rollover, cross-account booking, payment retry, registration, host schedules, administrator controls, map marker interaction and recovery, and five viewport sizes. The first full run passed 11 tests and failed the map case. A focused rerun exposed the overlapping seed reservation behind the expected price result. The corrected test verifies both the empty available-only state and the matching result when unavailable listings are included. The following full runs passed all 12 tests.
- `npm audit --audit-level=high` reported **0 known vulnerabilities**. The first audit request encountered a registry connection error, and a retry completed.
- The native app served HTTP **200** at [localhost:5173](http://localhost:5173/) and its [proxied health endpoint](http://localhost:5173/api/health) returned `{"status":"ok"}`. Both migrations were already applied. Discovery read seven approved Adyar listings from the live local database.

## Driver and host demonstration

Two independent Chromium contexts signed in as Riya Sharma and Meera Nair. Riya booked Riverside Court for **24 hours at ₹840** using a browser set to Los Angeles time. Both sessions displayed the same times in IST and the same booking ID, `49de4e96-325c-4831-a9a4-e98a6158bf88`. Meera saw the booking and driver details, the confirmation notice and the earnings increase. Riya then cancelled. The browser verified the **−₹840 simulated refund**, Meera's cancellation notice and updated status, her earnings returning to the prior total, and Riverside Court becoming available for the exact same interval. The scripted flow took **7.7 seconds** from the start of sign-in through confirmation.

## Screenshots

Screenshots come from Playwright against the PostgreSQL-backed demo with external tiles intercepted. The search shots cover [iPhone 375 × 812](screenshots/search-iphone.png), [Android 393 × 873](screenshots/search-android.png), [tablet 768 × 1024](screenshots/search-tablet.png), [laptop 1280 × 800](screenshots/search-laptop.png) and [desktop 1536 × 960](screenshots/search-desktop.png). The booking journey includes [mobile review](screenshots/review-iphone.png), [desktop review](screenshots/review-desktop.png), [confirmation](screenshots/confirmation-desktop.png) and [host dashboard](screenshots/host-desktop.png).

The Docker CLI was unavailable for container verification. This demo uses simulated payments and in-app notifications. The booking timer measures the scripted browser flow. First-time user timing would need a usability session.

See the [local startup steps and five-minute examiner demo](../HOW_TO_DEMONSTRATE_DRIVESHARE.md) and [seeded demo credentials](../DEMO_ACCOUNTS.md).
