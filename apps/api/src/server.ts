import { app } from './app.js';
import { settings } from './config.js';
import { db } from './db.js';
import { transaction } from './db.js';
import { lockSpot, alertWaiters } from './engine.js';
import { now } from './clock.js';
const server = app.listen(settings.port, () =>
  console.log(`DriveShare API listening on http://localhost:${settings.port}`),
);
const cleanup = setInterval(async () => {
  try {
    const stale = await db.booking.findMany({
      where: { bookingStatus: 'PAYMENT_PENDING', holdExpiresAt: { lte: now() } },
      select: { parkingSpotId: true },
      distinct: ['parkingSpotId'],
    });
    for (const b of stale)
      await transaction(async (tx) => {
        await lockSpot(tx, b.parkingSpotId);
        await alertWaiters(tx, b.parkingSpotId);
      });
  } catch {
    console.error('Hold cleanup deferred; allocation still expires holds transactionally.');
  }
}, 30000);
async function shutdown() {
  clearInterval(cleanup);
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
