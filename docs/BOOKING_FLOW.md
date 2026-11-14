# Booking, payment and physical occupancy

## Reservation flow

```mermaid
flowchart TD
  S[Driver selects space, vehicle and interval] --> L[Begin transaction / lock parking row]
  L --> X[Expire stale holds under lock]
  X --> I{Matching idempotency key?}
  I -->|same payload| R[Return existing booking]
  I -->|different payload| E[409 conflict]
  I -->|new| V[Validate listing, vehicle, recurring hours, blocks and physical occupancy]
  V --> A{Interval available?}
  A -->|yes| H[Create PAYMENT_PENDING hold with expiry]
  A -->|no, waiting requested| W[Create nonblocking WAITLISTED record]
  A -->|no| E
  H --> C[Commit / database exclusion backstop]
  W --> C
  C --> P[Demo checkout or waiting-list page]
```

## Payment flow

```mermaid
sequenceDiagram
  actor Driver
  participant API
  participant DB as PostgreSQL
  Driver->>API: Method + outcome + idempotency key (no amount)
  API->>DB: Begin; lock space; reload booking
  API->>DB: Check prior key and validate payload
  alt key already processed
    DB-->>API: Existing payment and current booking
  else new success with valid unexpired hold
    API->>DB: Insert SUCCESS demo ledger entry
    API->>DB: Set booking CONFIRMED and payment SUCCESS
    API->>DB: Commit both changes
  else simulated failure with valid hold
    API->>DB: Insert FAILED attempt; keep original hold deadline
    API->>DB: Commit
  else expired or invalid booking
    API-->>Driver: 409; reserve again
  end
  API-->>Driver: Explicitly simulated result
```

Failures count as attempts, not revenue. Double submissions under the same key return one record. A different key cannot create another successful booking charge because both state validation and a partial unique index prevent it. Fine payments require a completed session with a finalized undisputed outstanding fine.

## Cancellation flow

```mermaid
flowchart TD
  C[Cancellation requested] --> L[Lock space and reload booking]
  L --> O{Physically occupied?}
  O -->|yes| N[Reject: verified departure required]
  O -->|no| V{Eligible state and authorized actor?}
  V -->|no| N
  V -->|yes| F[Calculate server-side fee; host or unavailable means full refund]
  F --> P[Signed refund of original payment + fee entry if applicable]
  P --> U[Set CANCELLED / preserve history]
  U --> W[Recalculate eligible waiting intervals and add in-app notices]
  W --> T[Commit all changes together]
  T --> A[Interval searchable; waiter can attempt a new hold]
```

For an owner block, the first attempt returns affected IDs and times. The UI requires an explicit full-refund confirmation with those IDs. The transaction locks and revalidates the exact affected set, cancels those unoccupied bookings, and creates the block. Waiters are not told the newly blocked interval is available.

## Overstay and fine handling

```mermaid
flowchart TD
  B[Paid confirmed reservation] --> A[Driver requests arrival]
  A --> H[Host verifies vehicle and confirms CHECKED_IN]
  H --> O[occupied=true; unique occupied-space index]
  O --> T{Server time past scheduled end?}
  T -->|no| R[Show checkout reminder in final 15 minutes]
  T -->|yes| F[Provisional snapshotted-policy fine; protect next driver]
  R --> Q[Driver requests checkout]
  F --> Q
  Q --> C[CHECKOUT_PENDING; cap fine at request+15 min; occupancy remains]
  C --> V{Departure verified?}
  V -->|host| D[Finalize fine; COMPLETED; occupied=false]
  V -->|disputed| X[Freeze accumulation; store driver and host evidence]
  X --> M[Admin resolves and can verify departure / waive or adjust fine]
  M --> D
  D --> P[Simulated fine payment if finalized and undisputed]
```

If a booking is followed by another, the next driver receives an in-app unavailable-space warning while the previous occupant is overdue. Checking in is forbidden until physical exit is verified. The next driver may cancel for a full simulated refund, regardless of the normal late-cancellation fee.

The browser cannot declare that a vehicle has departed. A driver checkout request or dispute freezes/caps financial exposure under the documented policy but leaves physical occupancy unchanged. No-show handling similarly requires an owning host/admin to verify actual absence after the arrival grace period; absence is not inferred automatically.
