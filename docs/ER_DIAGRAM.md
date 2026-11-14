# Eight-table entity relationship diagram

```mermaid
erDiagram
  USERS ||--o{ PARKING_SPOTS : owns
  USERS ||--o{ BOOKINGS : reserves
  USERS ||--o{ VEHICLES : registers
  USERS ||--o{ REVIEWS : writes
  USERS ||--o{ BLOCKED_SLOTS : creates
  USERS o|--o{ BOOKINGS : verifies_exit
  PARKING_SPOTS ||--o{ AVAILABILITY_SLOTS : offers
  PARKING_SPOTS ||--o{ BLOCKED_SLOTS : excludes
  PARKING_SPOTS ||--o{ BOOKINGS : receives
  PARKING_SPOTS ||--o{ REVIEWS : earns
  VEHICLES ||--o{ BOOKINGS : used_for
  BOOKINGS ||--o{ PAYMENTS : records
  BOOKINGS ||--o| REVIEWS : permits_after_completion
  USERS {
    uuid id PK
    string email UK
    string password_hash
    array role
    string account_status
    json notifications
  }
  PARKING_SPOTS {
    uuid id PK
    uuid owner_id FK
    int hourly_price
    string timezone
    string approval_status
    boolean is_active
  }
  AVAILABILITY_SLOTS {
    uuid id PK
    uuid parking_spot_id FK
    int day_of_week
    string start_time
    string end_time
    date effective_from
    date effective_until
  }
  BOOKINGS {
    uuid id PK
    uuid driver_id FK
    uuid parking_spot_id FK
    uuid vehicle_id FK
    timestamp start_time
    timestamp end_time
    timestamp hold_expires_at
    boolean occupied
    string booking_status
    string payment_status
    string idempotency_key UK
    uuid exit_confirmed_by FK
    json dispute
  }
  PAYMENTS {
    uuid id PK
    uuid booking_id FK
    int amount
    string payment_type
    string payment_status
    string transaction_reference UK
    string idempotency_key UK
  }
  REVIEWS {
    uuid id PK
    uuid booking_id FK,UK
    uuid reviewer_id FK
    uuid parking_spot_id FK
    int rating
  }
  BLOCKED_SLOTS {
    uuid id PK
    uuid parking_spot_id FK
    uuid created_by FK
    timestamp start_time
    timestamp end_time
  }
  VEHICLES {
    uuid id PK
    uuid user_id FK
    string registration_number
    string vehicle_type
    boolean is_active
  }
```

All relationships restrict historical deletion. The optional `exit_confirmed_by` foreign key is added by raw SQL. Its SQL constraint remains part of the committed migration even though it is not a Prisma navigation relation. Prisma migration metadata is excluded from this business ER diagram.
