import { db } from '../apps/api/src/db.js';
import { seed } from '../apps/api/prisma/seed.js';
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
  throw new Error('E2E reset requires a database ending in _test.');
await db.$executeRaw`TRUNCATE reviews,payments,bookings,blocked_slots,availability_slots,vehicles,parking_spots,users CASCADE`;
await seed();
await db.$disconnect();
