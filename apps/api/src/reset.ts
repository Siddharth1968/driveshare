import { db } from './db.js';
import { demo } from './config.js';
if (!demo) throw new Error('Reset is available only with DEMO_MODE=true outside production.');
if (!process.argv.includes('--confirm'))
  throw new Error(
    'This deletes local demo data. Run npm run db:reset -- --confirm only against your demo database.',
  );
await db.$executeRaw`TRUNCATE reviews, payments, bookings, blocked_slots, availability_slots, vehicles, parking_spots, users CASCADE`;
await db.$disconnect();
console.log('Local demo records cleared. Run npm run db:seed.');
