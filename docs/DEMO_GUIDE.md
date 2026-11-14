# Classroom demonstration guide

The campus is real. The parking listings, people, vehicles, images and reviews are fictional. Every payment screen states **DEMO PAYMENT — NO REAL MONEY WILL BE CHARGED**. Use separate browser profiles or private windows for simultaneous roles. The [demo account sheet](../DEMO_ACCOUNTS.md) and [five-minute demonstration](../HOW_TO_DEMONSTRATE_DRIVESHARE.md) cover the primary driver and host journey. The examples below use the same local demo password, `DriveShareDemo!23`.

The seed is relative to API startup time. Start with a fresh demo seed for a predictable presentation; keep the API running. Do not wait hours for an overstay: the seed already includes one. Admin overview can advance demo time 35 minutes and restore real time; production disables these controls. Reset uses an explicit local CLI command, not an unauthenticated web endpoint.

## 1. Normal booking

1. Sign in as `driver4@driveshare.demo`.
2. Open Find Parking. The map centres on Sahyadri College and shows interactive markers. It has an illustrated offline mode.
3. Select a future hour and car. Choose **View details** on **Riverside Court** or another available listing.
4. Inspect the price and select Demo UPI, Demo Card or Demo Cash. Select **Confirm demo booking**.
5. Choose **View booking** on the confirmation page for the status, payment history and original terms. My Bookings and the driver dashboard also show the reservation.

The advanced payment page for an existing hold can simulate a failure and retry within the hold's original lifetime. Cancelling payment releases an unoccupied hold.

## 2. Double-booking prevention

1. In two profiles sign in as `driver@driveshare.demo` and `driver2@driveshare.demo`.
2. Choose the same free listing and identical future start/end values.
3. Reserve in both profiles. Only one active hold succeeds. The other receives an unavailable message and may choose a waiting entry.
4. Explain that this result is protected by PostgreSQL locks and range exclusions, not button timing. The automated race test submits twelve concurrent attempts and asserts one winner.

## 3. Cancellation and instant release

1. Complete the first booking's demo payment.
2. On booking details choose Cancel booking, enter a reason, and confirm. More than 60 minutes before arrival is free; within 60 minutes costs 10%; after start, an unoccupied cancellation costs 25%.
3. Show the negative REFUND and optional positive CANCELLATION_FEE in payment history.
4. In the other driver profile, reserve the same interval successfully. No deletion of historical bookings occurs.

For a time-sensitive fee demonstration use admin clock advance or choose a start 30 minutes ahead. An occupied session cannot use cancellation to release a physically parked vehicle.

## 4. Overstay and verified departure

1. As `driver@driveshare.demo`, open the seeded overdue **Sahyadri Gate Courtyard** session. It ended approximately 35 minutes before seeding, with an initial provisional fine of ₹40 that increases with elapsed time. Databases seeded before the redesign retain their original booking titles and history.
2. In the host profile `owner@driveshare.demo`, open Reservations and that session. Inspect physical occupancy.
3. The driver requests checkout. The host physically verifies departure and chooses Verify departure & checkout.
4. The fine becomes finalized, the booking COMPLETED and occupied=false. The driver selects Pay demo fine and completes the explicitly simulated payment.

To show a newly created overstay: make/pay a reservation starting shortly, have the owning host confirm entry during its window, advance admin time past end+grace, then follow the same verified checkout. Use API server time displayed on reservation details; never change the laptop clock.

## 5. Waiting list

1. `driver2@driveshare.demo` has a future confirmed **College Road Parking** booking approximately two hours after fresh seeding.
2. `driver3@driveshare.demo` has a matching nonblocking waiting entry.
3. Cancel the confirmed booking as driver2. In driver3's Notifications, see that the interval was released (polling may take up to 15 seconds).
4. Open the waiting entry and Try reserving released space, then explicitly make demo payment.

Waiters are never automatically charged. All eligible waiters receive a notice evaluated in joining order; the first successful locked reservation wins. Notifications do not promise an exclusive queue position.

## 6. Host creates; administrator reviews

1. Sign in as a host, open My parking spaces and List a space. Supply address, coordinates, vehicle support, price, instructions and permission confirmation. Upload a local JPEG/PNG/WebP if desired.
2. Save and set recurring availability. Use a valid window or daily all-day windows, then save.
3. The listing is pending and cannot be booked publicly.
4. As admin, open Listing approvals, inspect and approve with notes. Return to discovery and find the new listing.

The seed's **The Quiet Driveway** can also demonstrate pending approval quickly. Edits return listings to review, while existing confirmed reservations retain their saved prices and arrival instructions.

## 7. Next-driver protection

Do this before completing scenario 4, since confirmed departure intentionally resolves the conflict.

1. The overdue Courtyard vehicle belongs to driver1; driver4 has the next confirmed reservation starting roughly 10 minutes after seed.
2. Sign in as `driver4@driveshare.demo`. Open Notifications and the next Courtyard reservation.
3. See previous-vehicle occupancy and full-refund choice. An owning host cannot check in that driver while the previous vehicle occupies the bay. Advance demo time if necessary to be within the entry window.
4. Cancel as driver4 and show a full simulated refund, even within the normal fee window.

## Disputes, unfair fines and no-shows

Admin → Disputes includes a seeded completed **Adyar Garden Residence** session whose fine is disputed because the host was delayed. Inspect driver evidence, record a reason, set fine to zero, and record resolution. A zero-value ADJUSTMENT preserves the administrative event without inventing revenue. A paid-fine reduction creates the corresponding negative refund.

For an occupied contested exit, the administrator must explicitly verify departure before releasing occupancy/finalizing a revised fine. Driver disputes freeze accumulation at dispute time or an earlier cap; host responses are retained. This is human verification, not hardware detection.

A host can report a no-show only after the 30-minute arrival grace period and explicitly verifying physical absence. The remaining interval releases, the driver receives a notice, and the net demonstration fee is 25%. The driver may dispute; an administrator can reverse an incorrect report's fee. A missed browser button alone never implies absence.

## Three-minute presentation script

“DriveShare helps use existing private parking more efficiently. A homeowner lists one bay and its recurring hours, and an administrator reviews the listing. Drivers explore spaces on an interactive map, choose their own vehicle and interval, and use simulated payment.

“The database is PostgreSQL, with eight business tables. Users connect to vehicles, spaces and bookings; bookings connect to signed accounting entries and a completed-booking review. A single account can be a driver and a host.

“The most important feature is concurrency safety. Every inventory change locks the parking row before checking availability, and PostgreSQL excludes overlapping active timestamp ranges. A five-minute hold protects checkout, and expired holds are retired inside allocation transactions even if background cleanup is delayed.

“Scheduled time and actual occupancy are different. A car that overstays keeps occupying the bay until a host or administrator verifies departure. The next driver sees a warning and can cancel for a full simulated refund. Fine rules use server time, with grace, started intervals and a dispute cap.

“Refunds are negative ledger entries. Replayed payment requests return the same record instead of charging twice. We tested real PostgreSQL constraints, simultaneous operations, security checks and browser journeys. The bundled map avoids mandatory external services. Docker deployment files and native instructions are included; the test report distinguishes what was actually run from environment-limited checks.”

## Viva questions and answers

1. **Why PostgreSQL?** It provides durable transactions, row locks, timestamp ranges and exclusion constraints that express interval conflicts directly.
2. **What is a primary key?** A unique identity for a row; every business table uses a UUID `id`.
3. **What is a foreign key?** A rule requiring a referenced row to exist. A booking's driver, vehicle and space IDs are foreign keys.
4. **Why exactly eight tables?** They represent the eight required business entities. Sessions use signed cookies; disputes, audits and notices use JSON on the relevant entity instead of extra operational tables.
5. **What does `[start,end)` mean?** Start is included and end excluded. A booking ending at noon and another starting at noon are adjacent rather than overlapping.
6. **How do you prevent double booking under simultaneous requests?** Lock the same parking row before decisions, then rely on a PostgreSQL GiST exclusion constraint as a backstop.
7. **Why not only check availability in React?** Two browsers can both see the same old state. Only the server/database can coordinate concurrent writers.
8. **What is a transaction?** A group of changes that commits or rolls back together. Payment creation and booking confirmation are one transaction.
9. **Where are ACID properties visible?** Atomic payment/confirmation; constraint consistency; lock-based isolation; and durable committed records in PostgreSQL's persistent volume.
10. **Why can't `now()` simply appear in the hold exclusion predicate?** Index predicates must not change meaning just because time passes. Holds change status under a transaction lock instead.
11. **What is idempotency?** Repeating the same intended operation has one effect. Unique user-scoped request keys return the earlier reservation/payment; changed payloads are rejected.
12. **Why keep physical occupancy separate?** A scheduled end time cannot prove a car has left. Host/admin verification is required to release actual occupancy.
13. **How is the example fine ₹40?** Thirty-five minutes late minus ten grace gives twenty-five chargeable minutes; two started fifteen-minute intervals at ₹20 each.
14. **How do refunds avoid inflating revenue?** Original payments are positive, refunds negative, and only successful entries contribute to net earnings.
15. **Can the browser change prices or fines?** No. The API rejects extra amount fields and calculates authoritative amounts using stored prices and snapshotted policies.
16. **Can hosts become administrators by editing their requests?** No. Public registration accepts only driver/host choices; administrator routes enforce server-side capabilities.
17. **Why soft-delete vehicles?** Existing bookings must retain references and history. The active flag removes a vehicle from the garage without deleting its row.
18. **How do you protect against CSRF?** Unsafe browser requests need the configured Origin and a CSRF nonce bound to the signed HttpOnly session cookie.
19. **How is the waiting list fair?** Eligible entries are evaluated in joining order, all receive the same notice, and no one is charged automatically. The first successful reservation wins; no exclusive queue position is promised.
20. **What happens without internet?** After dependencies are installed, the map switches to the bundled illustration with interactive parking markers. Discovery, database access, bookings and demo payments operate locally.
21. **Is this ready to collect real money?** No. It deliberately has no financial gateway. Payments are fictional ledger entries clearly labelled in the UI.
22. **What must be verified before claiming full portability?** Clean installation, migrations, seed, tests, browser flow and actual Docker container startup on a Docker-equipped host. Read the execution report for current evidence.
