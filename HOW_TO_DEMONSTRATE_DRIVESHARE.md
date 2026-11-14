# How to demonstrate DriveShare

## Start the local app

Use the `codex/ui-redesign` branch in your existing DriveShare checkout. Install Node.js 24 LTS if needed. In PowerShell, open the project directory and run:

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run db:generate
npm run db:local
```

Keep the PostgreSQL terminal running. In a second PowerShell terminal in the same project directory, run:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open [DriveShare](http://localhost:5173/). If those services are already running, go directly to the URL. The [health endpoint](http://localhost:5173/api/health) should return `{"status":"ok"}` through the frontend proxy. Seeding can be repeated. It preserves existing accounts and bookings and adds missing campus spaces by their stable IDs. An existing PostgreSQL installation can also be used. See [installation](docs/INSTALLATION.md) for its configuration.

## Five-minute demonstration

| Time      | What to do and show                                                                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:45 | Sign in as `driver@driveshare.demo`. In a private window, sign in as `owner@driveshare.demo` and keep the host dashboard open. Both use `DriveShareDemo!23`.                                                                                                                                                                                                   |
| 0:45–1:30 | In Find Parking, keep **Adyar** and **Car**. Pick tomorrow as check-in and **10:00** IST. Choose **24 Hours** and show that checkout becomes the following day at **10:00**. Select **Find parking**. If your local database already has a reservation for that time, choose another future day.                                                               |
| 1:30–2:15 | Find **Riverside Court**. Choose **View details** and point out the same times, **24h**, and **₹840**. Select **Confirm demo booking** and copy the full booking ID from the confirmation page.                                                                                                                                                                |
| 2:15–3:00 | Switch to the host dashboard. Allow up to five seconds for the next refresh. Find the exact ID, **Riya Sharma**, **Riverside Court**, both times, **24h**, **₹840**, and **confirmed**. Select **View details** to show the same record and the host’s arrival and departure workflow. Open **Notifications** for the confirmation.                            |
| 3:00–4:00 | In the driver window, select **View booking** then **Cancel booking**. Enter a reason and confirm. Choose a start more than 60 minutes ahead for a full simulated refund. In the host window, show the cancellation notice and the same ID marked **cancelled**. Return to Find Parking and search the exact dates again to show Riverside Court is available. |
| 4:00–5:00 | Explain that PostgreSQL locks the parking row during allocation and rejects overlapping active time ranges. Point out that cancelling releases the interval, preserves the booking history, and records the refund. If time allows, show **My parking spaces** and the host’s availability controls.                                                           |

Use the [account sheet](DEMO_ACCOUNTS.md) for the administrator and the [advanced classroom guide](docs/DEMO_GUIDE.md) for the seeded occupancy, waitlist and dispute scenarios. The college is real. Demo spaces and their images are fictional. The map uses OpenStreetMap tiles when reachable and an illustrated map with the same markers when offline. **Open in Google Maps** uses a directions link. [Campus reference](https://www.sahyadri.edu.in/contact), [Google Maps directions URL documentation](https://developers.google.com/maps/documentation/urls/get-started).

## Three-minute presentation script

**0:00–1:00 · What the driver sees**

“DriveShare is a peer-to-peer parking system. We’re using Sahyadri College in Adyar, Mangaluru as the centre of this demo. The college is real and the parking spaces are sample data. I’m signed in as Riya. I choose tomorrow at ten in the morning, then tap 24 Hours. The app fills in ten the following morning, in Indian Standard Time. Riverside Court costs ₹35 per hour, so the total is ₹840. One confirmation runs the demo payment and gives me a booking ID.”

**1:00–2:00 · What the host sees**

“This private window is signed in as Meera, the host. Her dashboard shows Riya’s booking with the same ID, space, dates, duration and price. Both accounts read the same PostgreSQL record. The host gets an in-app notice and can open the booking to verify an arrival or departure. When Riya cancels, Meera receives a second notice. The reservation is still in their history, and the same dates are available to book again.”

**2:00–3:00 · What the database guarantees**

“Two drivers can see the same space as available at the same time. On confirmation, the API locks the space row before making an allocation. PostgreSQL also has an exclusion constraint for active time ranges, so simultaneous overlapping reservations cannot both commit. ACID describes what we rely on. Atomicity means payment, confirmation and its notices commit together. Consistency means the database still enforces its booking and ledger rules. Isolation coordinates competing requests, and durability means committed records survive a restart. The project also keeps waiting lists, verified occupancy, overstay fines and disputes, which you can see in the other demo scenarios.”
