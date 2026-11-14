import '../src/config.js';
import bcrypt from 'bcryptjs';
import { db } from '../src/db.js';
import { demo } from '../src/config.js';
import { policy } from '../src/policies.js';
import { now } from '../src/clock.js';
import { randomUUID } from 'node:crypto';
import { campusSpaces } from './campus-seed.js';

export async function seed() {
  if (!demo) throw new Error('Seeding requires DEMO_MODE=true and NODE_ENV other than production.');
  if (await db.user.findUnique({ where: { email: 'admin@driveshare.demo' } })) {
    const owners = await db.user.findMany({
      where: { email: { in: ['owner@driveshare.demo', 'owner2@driveshare.demo'] } },
      orderBy: { email: 'asc' },
    });
    const orderedOwners = ['owner@driveshare.demo', 'owner2@driveshare.demo']
      .map((email) => owners.find((u) => u.email === email)?.id)
      .filter((id): id is string => Boolean(id));
    if (orderedOwners.length)
      await db.$transaction((tx) => campusSpaces(tx, orderedOwners), { timeout: 30000 });
    console.log(
      'Existing records preserved; stable-ID Sahyadri demo spaces ensured without duplicates.',
    );
    return;
  }
  const hash = await bcrypt.hash('DriveShareDemo!23', 12);
  await db.$transaction(
    async (tx) => {
      const people = [
        ['Aditi Rao', 'admin', 'ADMIN'],
        ['Meera Nair', 'owner', 'OWNER'],
        ['Arjun Shah', 'owner2', 'OWNER'],
        ['Riya Sharma', 'driver', 'DRIVER'],
        ['Kabir Patel', 'driver2', 'DRIVER'],
        ['Ananya Iyer', 'driver3', 'DRIVER'],
        ['Dev Mehta', 'driver4', 'DRIVER'],
      ];
      const users = [];
      for (const [fullName, name, role] of people)
        users.push(
          await tx.user.create({
            data: {
              fullName,
              email: `${name}@driveshare.demo`,
              passwordHash: hash,
              roles: role === 'OWNER' ? ['DRIVER', 'OWNER'] : [role],
              emailVerified: true,
            },
          }),
        );
      const vehicles = [];
      for (let i = 3; i < 7; i++)
        vehicles.push(
          await tx.vehicle.create({
            data: {
              userId: users[i].id,
              registrationNumber: `DEMO KA 0${i} AB ${1200 + i}`,
              vehicleType: i === 5 ? 'TWO_WHEELER' : 'CAR',
              vehicleModel: i === 5 ? 'Honda Activa (demo)' : 'Maruti Swift (demo)',
            },
          }),
        );
      const spots = await campusSpaces(tx, [users[1].id, users[2].id]);
      const t = +now(),
        minute = 60000;
      async function booking(
        s: number,
        d: number,
        start: number,
        end: number,
        status: string,
        extra: Record<string, unknown> = {},
      ) {
        const amount = Math.ceil(((end - start) / 3600000) * spots[s].hourlyPrice);
        const b = await tx.booking.create({
          data: {
            driverId: users[d + 3].id,
            parkingSpotId: spots[s].id,
            vehicleId: vehicles[d].id,
            startTime: new Date(start),
            endTime: new Date(end),
            bookingStatus: status,
            paymentStatus: ['WAITLISTED', 'PAYMENT_PENDING'].includes(status)
              ? 'PENDING'
              : 'SUCCESS',
            totalAmount: amount,
            priceSnapshot: spots[s].hourlyPrice,
            termsSnapshot: {
              ...policy(),
              title: spots[s].title,
              address: spots[s].address,
              accessInstructions: spots[s].accessInstructions,
              timezone: 'Asia/Kolkata',
            },
            idempotencyKey: `seed:${randomUUID()}`,
            audit: [{ action: 'DEMO_SEEDED', at: now().toISOString() }],
            ...extra,
          },
        });
        if (b.paymentStatus === 'SUCCESS')
          await tx.payment.create({
            data: {
              bookingId: b.id,
              paymentType: 'BOOKING',
              amount,
              paymentMethod: 'DEMO_UPI',
              paymentStatus: 'SUCCESS',
              transactionReference: `DEMO-SEED-${randomUUID()}`,
              idempotencyKey: `seed-payment:${b.id}`,
            },
          });
        return b;
      }
      await booking(0, 0, t - 180 * minute, t - 35 * minute, 'CHECKED_IN', {
        occupied: true,
        checkedInAt: new Date(t - 175 * minute),
      });
      await booking(0, 3, t + 10 * minute, t + 70 * minute, 'CONFIRMED');
      const disputed = await booking(1, 1, t - 86400000, t - 86400000 + 3600000, 'COMPLETED', {
        checkedInAt: new Date(t - 86400000),
        actualExitTime: new Date(t - 86400000 + 95 * minute),
        exitConfirmedBy: users[2].id,
        overstayMinutes: 35,
        fineAmount: 4000,
        fineStatus: 'DISPUTED',
        dispute: {
          status: 'OPEN',
          message:
            'The host was delayed confirming my departure. Please review this demonstration fine.',
          openedAt: now().toISOString(),
          responses: [],
        },
      });
      await booking(2, 1, t + 120 * minute, t + 240 * minute, 'CONFIRMED');
      await booking(2, 2, t + 120 * minute, t + 240 * minute, 'WAITLISTED');
      const completed = await booking(3, 0, t - 172800000, t - 172800000 + 3600000, 'COMPLETED', {
        actualExitTime: new Date(t - 172800000 + 3600000),
        checkedInAt: new Date(t - 172800000),
        exitConfirmedBy: users[2].id,
      });
      await tx.review.create({
        data: {
          bookingId: completed.id,
          reviewerId: completed.driverId,
          parkingSpotId: completed.parkingSpotId,
          rating: 5,
          comment: 'Easy to find, a welcoming host, and plenty of room. Fictional demo review.',
        },
      });
      await tx.review.create({
        data: {
          bookingId: disputed.id,
          reviewerId: disputed.driverId,
          parkingSpotId: disputed.parkingSpotId,
          rating: 4,
          comment: 'A convenient space near campus. Fictional demo review.',
        },
      });
      const cancelled = await booking(4, 2, t - 7200000, t - 3600000, 'CANCELLED', {
        cancelledAt: new Date(t - 86400000),
        cancellationReason: 'Plans changed (demo)',
        paymentStatus: 'SUCCESS',
      });
      await tx.payment.create({
        data: {
          bookingId: cancelled.id,
          paymentType: 'REFUND',
          amount: -cancelled.totalAmount,
          paymentMethod: 'DEMO_SYSTEM',
          paymentStatus: 'SUCCESS',
          transactionReference: `DEMO-SEED-${randomUUID()}`,
          idempotencyKey: `refund:${cancelled.id}`,
        },
      });
      await tx.booking.update({ where: { id: cancelled.id }, data: { paymentStatus: 'REFUNDED' } });
    },
    { timeout: 30000 },
  );
  console.log(
    'Created fictional demo accounts, 8 spaces, schedules, sessions, waitlist, reviews and signed payment entries.',
  );
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prisma/seed.ts'))
  seed().finally(() => db.$disconnect());
