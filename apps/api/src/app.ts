import express, { type Request, type Response, type NextFunction } from 'express';
import { campus } from './campus.js';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import { db, transaction } from './db.js';
import { now, setDemoTime } from './clock.js';
import { demo, production, settings } from './config.js';
import { optionalAuth, requireAuth, role, issueSession, publicUser } from './auth.js';
import { AppError, ensure } from './errors.js';
import { cloudinaryImageStore, imageHeaders, maxImageBytes } from './image-storage.js';
import * as v from './validation.js';
import { active, coveredBySchedule, distanceKm, validateInterval } from './policies.js';
import {
  reserve,
  pay,
  cancel,
  bookingAction,
  bookingInclude,
  decorateBooking,
  lockSpot,
  ownsSpot,
  appendAudit,
  event,
  cancelInTransaction,
  alertWaiters,
} from './engine.js';

const uploadDir = resolve(process.env.DRIVESHARE_UPLOAD_DIR ?? 'uploads');
const hostedImages = cloudinaryImageStore();

export const app = express();
app.disable('x-powered-by');
if (production)
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: process.env.NODE_ENV === 'test' ? 10000 : 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
);
app.use((req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== settings.origin)
    return next(new AppError(403, 'Untrusted request origin.'));
  next();
});
app.use('/api', optionalAuth);
if (hostedImages) {
  app.get('/uploads/:filename', async (req, res) => {
    const image = await hostedImages.read(req.params.filename);
    ensure(image, 404, 'Image not found.');
    res
      .set(imageHeaders)
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .type(image.contentType)
      .send(image.body);
  });
} else {
  app.use(
    '/uploads',
    express.static(uploadDir, {
      dotfiles: 'deny',
      setHeaders: (res) => {
        for (const [name, value] of Object.entries(imageHeaders)) res.setHeader(name, value);
      },
    }),
  );
}
const id = (req: Request) => v.uuid.parse(req.params.id);
const authRate = rateLimit({
  windowMs: 15 * 60000,
  limit: process.env.NODE_ENV === 'test' ? 10000 : 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});
app.get('/api/config', (_req, res) =>
  res.json({
    demo,
    serverTime: now(),
    areas: ['Adyar', 'Mangaluru', 'Sahyadri College', 'College Road'],
    campus,
    policy: {
      holdMinutes: settings.holdMinutes,
      graceMinutes: settings.graceMinutes,
      fineInterval: settings.fineInterval,
      fineRupees: settings.fineRupees,
      cancellation: `Free cancellation more than ${settings.freeCancellationMinutes} minutes before arrival. ${settings.lateCancellationPercent}% within that window; ${settings.afterStartCancellationPercent}% after start if unoccupied. Full refund if your space is unavailable.`,
    },
  }),
);
app.post('/api/auth/register', authRate, async (req, res) => {
  const input = v.registration.parse(req.body);
  const user = await db.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 12),
      roles: input.owner ? ['DRIVER', 'OWNER'] : ['DRIVER'],
    },
  });
  res.status(201).json({ user: publicUser(user), csrf: await issueSession(res, user) });
});
app.post('/api/auth/login', authRate, async (req, res) => {
  const input = v.login.parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? '$2b$12$8NbYJzpYxBNeBmhO5RTTGe0S4L7r8oOxpn24ZX6llNGEePBgoK.0q',
  );
  ensure(
    user && valid && user.accountStatus === 'ACTIVE',
    401,
    'Invalid credentials or account unavailable.',
  );
  res.json({ user: publicUser(user), csrf: await issueSession(res, user) });
});
app.post('/api/auth/demo-login', authRate, async (req, res) => {
  const input = v.demoLogin.parse(req.body);
  const user = await db.user.findUnique({ where: { email: `${input.role}@driveshare.demo` } });
  ensure(
    user && user.accountStatus === 'ACTIVE',
    401,
    'Invalid credentials or account unavailable.',
  );
  const showcase = input.role === 'admin';
  res.json({
    user: publicUser(user, showcase),
    csrf: await issueSession(res, user, showcase),
  });
});
app.get('/api/auth/me', (req, res) =>
  res.json({
    user: req.user ? publicUser(req.user, req.showcase) : null,
    csrf: req.csrf ?? null,
  }),
);
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  if (!req.showcase) {
    await db.user.update({
      where: { id: req.user!.id },
      data: { sessionVersion: { increment: 1 } },
    });
  }
  res
    .clearCookie('driveshare_session', {
      path: '/',
      sameSite: 'lax',
      secure: production,
      httpOnly: true,
    })
    .json({ ok: true });
});
app.post('/api/auth/owner', requireAuth, async (req, res) => {
  const user = await db.user.update({
    where: { id: req.user!.id },
    data: { roles: [...new Set([...req.user!.roles, 'OWNER'])] },
  });
  res.json(publicUser(user));
});
app.get('/api/notifications', requireAuth, async (req, res) => {
  const bookings = await db.booking.findMany({
    where: {
      driverId: req.user!.id,
      bookingStatus: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKOUT_PENDING'] },
    },
  });
  const alerts = [];
  for (const b of bookings) {
    const decorated = await decorateBooking(b);
    if (decorated.spaceUnavailable)
      alerts.push({
        id: `occupied-${b.id}`,
        message:
          'Your reserved space is still occupied by a previous vehicle. Check-in is blocked; you can cancel for a full simulated refund.',
        bookingId: b.id,
        at: now(),
        read: false,
      });
    if (decorated.checkoutReminder)
      alerts.push({
        id: `checkout-${b.id}`,
        message:
          'Your checkout time is approaching or has passed. Request checkout and ask the owner to verify departure.',
        bookingId: b.id,
        at: now(),
        read: false,
      });
    if (b.bookingStatus === 'CONFIRMED' && +now() >= +b.startTime - 15 * 60000 && now() < b.endTime)
      alerts.push({
        id: `arrival-${b.id}`,
        message: 'Your reservation is ready. Ask the owner to verify your arrival.',
        bookingId: b.id,
        at: now(),
        read: false,
      });
  }
  res.json(
    [...alerts, ...(Array.isArray(req.user!.notifications) ? req.user!.notifications : [])]
      .slice(-200)
      .reverse(),
  );
});
app.post('/api/notifications/read', requireAuth, async (req, res) => {
  await db.$executeRaw`UPDATE users SET notifications = COALESCE((SELECT jsonb_agg(value || '{"read":true}'::jsonb) FROM jsonb_array_elements(notifications)), '[]'::jsonb) WHERE id = ${req.user!.id}::uuid`;
  res.json({ ok: true });
});
app.get('/api/vehicles', requireAuth, async (req, res) =>
  res.json(
    await db.vehicle.findMany({
      where: { userId: req.user!.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
  ),
);
app.post('/api/vehicles', requireAuth, async (req, res) =>
  res.status(201).json(
    await db.vehicle.create({
      data: { ...v.vehicleSchema.parse(req.body), userId: req.user!.id },
    }),
  ),
);
app.patch('/api/vehicles/:id', requireAuth, async (req, res) => {
  const vehicle = await db.vehicle.findUnique({ where: { id: id(req) } });
  ensure(
    vehicle?.userId === req.user!.id && vehicle.isActive,
    403,
    'You may only edit your own active vehicles.',
  );
  res.json(
    await db.vehicle.update({ where: { id: vehicle.id }, data: v.vehicleSchema.parse(req.body) }),
  );
});
app.delete('/api/vehicles/:id', requireAuth, async (req, res) => {
  const vehicle = await db.vehicle.findUnique({ where: { id: id(req) } });
  ensure(vehicle?.userId === req.user!.id, 403, 'You may only remove your own vehicles.');
  ensure(
    !(production && vehicle.registrationNumber === 'DEMO KA 03 AB 1203'),
    403,
    'The primary demonstration vehicle cannot be removed in the online demo.',
  );
  await db.vehicle.update({ where: { id: vehicle.id }, data: { isActive: false } });
  res.json({ ok: true });
});
app.get('/api/spots', async (req, res) => {
  const q = z
    .object({
      q: z.string().max(100).optional(),
      vehicleType: z.enum(['CAR', 'TWO_WHEELER']).optional(),
      maxPrice: z.coerce.number().min(0).optional(),
      start: v.iso.optional(),
      end: v.iso.optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      available: z.enum(['true', 'false']).optional(),
    })
    .parse(req.query);
  ensure(Boolean(q.start) === Boolean(q.end), 400, 'Provide both start and end time.');
  if (q.start && q.end) {
    validateInterval(new Date(q.start), new Date(q.end));
    ensure(+new Date(q.start) >= +now(), 400, 'Check-in must be in the future.');
    ensure(
      +new Date(q.end) - +new Date(q.start) >= 15 * 60000,
      400,
      'Reserve at least 15 minutes.',
    );
  }
  const spots = await db.parkingSpot.findMany({
    where: {
      approvalStatus: 'APPROVED',
      isActive: true,
      owner: { accountStatus: 'ACTIVE' },
      ...(q.q
        ? {
            OR: ['title', 'city', 'address'].map((k) => ({
              [k]: { contains: q.q, mode: 'insensitive' },
            })),
          }
        : {}),
      ...(q.vehicleType ? { vehicleTypes: { has: q.vehicleType } } : {}),
      ...(q.maxPrice ? { hourlyPrice: { lte: q.maxPrice } } : {}),
    },
    include: {
      availability: true,
      reviews: { select: { rating: true } },
      bookings: {
        where: {
          OR: [
            { occupied: true },
            {
              bookingStatus: { in: active },
              ...(q.start && q.end
                ? { startTime: { lt: new Date(q.end) }, endTime: { gt: new Date(q.start) } }
                : {}),
            },
          ],
        },
        select: {
          occupied: true,
          startTime: true,
          endTime: true,
          bookingStatus: true,
          holdExpiresAt: true,
        },
      },
      blocks:
        q.start && q.end
          ? { where: { startTime: { lt: new Date(q.end) }, endTime: { gt: new Date(q.start) } } }
          : false,
    },
  });
  const result = spots
    .map(({ bookings, reviews, blocks, ...s }) => {
      const physicallyOccupied = bookings.some((b) => b.occupied);
      const overdue = bookings.some((b) => b.occupied && b.endTime <= now());
      const reserved = bookings.some(
        (b) =>
          (!q.start ||
            !q.end ||
            (b.startTime < new Date(q.end) && b.endTime > new Date(q.start))) &&
          (b.bookingStatus !== 'PAYMENT_PENDING' || !b.holdExpiresAt || b.holdExpiresAt > now()),
      );
      const available =
        q.start && q.end
          ? !reserved &&
            !overdue &&
            !blocks?.length &&
            coveredBySchedule(s.availability, s.timezone, new Date(q.start), new Date(q.end))
          : !overdue;
      return {
        ...s,
        physicallyOccupied,
        available,
        rating: reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0,
        reviewCount: reviews.length,
        distance: distanceKm(
          q.lat ?? campus.latitude,
          q.lng ?? campus.longitude,
          s.latitude,
          s.longitude,
        ),
      };
    })
    .filter((s) => q.available !== 'true' || s.available)
    .sort((a, b) => a.distance - b.distance);
  res.json(result);
});
app.get('/api/spots/:id', async (req, res) => {
  const spot = await db.parkingSpot.findUnique({
    where: { id: id(req) },
    include: {
      availability: true,
      reviews: { include: { reviewer: { select: { fullName: true } } } },
      blocks: { where: { endTime: { gt: now() } } },
      owner: { select: { fullName: true, accountStatus: true } },
    },
  });
  ensure(
    spot &&
      ((spot.approvalStatus === 'APPROVED' &&
        spot.isActive &&
        spot.owner.accountStatus === 'ACTIVE') ||
        req.user?.id === spot.ownerId ||
        req.user?.roles.includes('ADMIN')),
    404,
    'Parking space not found.',
  );
  const occupied = await db.booking.count({ where: { parkingSpotId: spot.id, occupied: true } });
  res.json({ ...spot, physicallyOccupied: occupied > 0 });
});
app.get('/api/owner/spots', requireAuth, role('OWNER'), async (req, res) =>
  res.json(
    await db.parkingSpot.findMany({
      where: { ownerId: req.user!.id },
      include: {
        availability: true,
        blocks: { where: { endTime: { gt: now() } } },
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ),
);
app.post('/api/spots', requireAuth, role('OWNER'), async (req, res) =>
  res.status(201).json(
    await db.parkingSpot.create({
      data: {
        ...v.spotSchema.parse(req.body),
        ownerId: req.user!.id,
        audit: [event(req.user!.id, 'LISTING_CREATED')],
      },
    }),
  ),
);
app.patch('/api/spots/:id', requireAuth, role('OWNER'), async (req, res) => {
  const input = v.spotSchema.parse(req.body);
  res.json(
    await transaction(async (tx) => {
      const s = await lockSpot(tx, id(req));
      ownsSpot(req.user!, s.ownerId);
      return tx.parkingSpot.update({
        where: { id: s.id },
        data: {
          ...input,
          approvalStatus: 'PENDING',
          audit: appendAudit(s.audit, event(req.user!.id, 'LISTING_EDITED_REQUIRES_APPROVAL')),
        },
      });
    }),
  );
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageBytes, files: 1 },
});
app.post('/api/uploads', requireAuth, role('OWNER'), upload.single('image'), async (req, res) => {
  ensure(req.file, 400, 'Choose an image up to 5 MB.');
  const b = req.file.buffer;
  const ext =
    b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
      ? 'jpg'
      : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : null;
  ensure(ext, 400, 'Only JPEG, PNG and WebP images are supported.');
  const filename = `${randomUUID()}.${ext}`;
  if (hostedImages) {
    await hostedImages.save(filename, b, ext);
  } else {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(resolve(uploadDir, filename), b, { flag: 'wx' });
  }
  res.status(201).json({ url: `/uploads/${filename}` });
});
app.put('/api/spots/:id/availability', requireAuth, role('OWNER'), async (req, res) => {
  const { slots } = v.scheduleSchema.parse(req.body);
  const result = await transaction(async (tx) => {
    const s = await lockSpot(tx, id(req));
    ownsSpot(req.user!, s.ownerId);
    const converted = slots.map((a) => ({
      ...a,
      effectiveFrom: new Date(a.effectiveFrom),
      effectiveUntil: a.effectiveUntil ? new Date(a.effectiveUntil) : null,
      parkingSpotId: s.id,
    }));
    const futureBookings = await tx.booking.findMany({
      where: { parkingSpotId: s.id, bookingStatus: { in: active }, endTime: { gt: now() } },
    });
    ensure(
      futureBookings.every((b) =>
        coveredBySchedule(
          converted.map((a) => ({ ...a, id: '' })),
          s.timezone,
          b.startTime,
          b.endTime,
        ),
      ),
      409,
      'This schedule would invalidate existing reservations. Keep their intervals available or explicitly cancel them first.',
    );
    await tx.availabilitySlot.deleteMany({ where: { parkingSpotId: s.id } });
    await tx.availabilitySlot.createMany({ data: converted });
    return tx.availabilitySlot.findMany({ where: { parkingSpotId: s.id } });
  });
  res.json(result);
});
app.post('/api/spots/:id/blocks', requireAuth, role('OWNER'), async (req, res) => {
  const input = v.blockSchema.parse(req.body);
  const start = new Date(input.startTime),
    end = new Date(input.endTime);
  validateInterval(start, end, 366 * 24);
  res.status(201).json(
    await transaction(async (tx) => {
      const spot = await lockSpot(tx, id(req));
      ownsSpot(req.user!, spot.ownerId);
      const affected = await tx.booking.findMany({
        where: {
          parkingSpotId: spot.id,
          bookingStatus: { in: active },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });
      ensure(
        !affected.some((b) => b.occupied),
        409,
        'Verify physical checkout before blocking an occupied interval.',
      );
      ensure(
        !affected.length ||
          (input.resolveBookings &&
            affected.every((b) => input.affectedBookingIds.includes(b.id)) &&
            input.affectedBookingIds.length === affected.length),
        409,
        'This interval affects reservations. Review them and explicitly confirm full refunds before blocking.',
        {
          affectedBookings: affected.map((b) => ({
            id: b.id,
            startTime: b.startTime,
            endTime: b.endTime,
          })),
        },
      );
      for (const b of affected)
        await cancelInTransaction(
          tx,
          b,
          req.user!,
          spot.ownerId,
          `Owner block: ${input.reason}`,
          'CANCELLED',
          false,
        );
      const block = await tx.blockedSlot.create({
        data: {
          parkingSpotId: spot.id,
          startTime: start,
          endTime: end,
          reason: input.reason,
          createdBy: req.user!.id,
        },
      });
      return block;
    }),
  );
});
app.delete('/api/spots/:id/blocks/:blockId', requireAuth, role('OWNER'), async (req, res) => {
  await transaction(async (tx) => {
    const s = await lockSpot(tx, id(req));
    ownsSpot(req.user!, s.ownerId);
    const b = await tx.blockedSlot.findUnique({ where: { id: v.uuid.parse(req.params.blockId) } });
    ensure(b?.parkingSpotId === s.id, 404, 'Block not found.');
    await tx.blockedSlot.delete({ where: { id: b.id } });
    await alertWaiters(tx, s.id);
  });
  res.json({ ok: true });
});
app.post('/api/bookings', requireAuth, async (req, res) =>
  res.status(201).json(await reserve(req.user!, v.reserveSchema.parse(req.body))),
);
app.get('/api/bookings', requireAuth, async (req, res) => {
  const owner = req.query.scope === 'owner';
  const bookings = await db.booking.findMany({
    where: owner ? { spot: { ownerId: req.user!.id } } : { driverId: req.user!.id },
    include: { ...bookingInclude, driver: { select: { fullName: true } } },
    orderBy: { startTime: 'desc' },
  });
  res.json(await Promise.all(bookings.map(decorateBooking)));
});
app.get('/api/bookings/:id', requireAuth, async (req, res) => {
  const b = await db.booking.findUnique({
    where: { id: id(req) },
    include: { ...bookingInclude, driver: { select: { fullName: true } } },
  });
  ensure(b, 404, 'Booking not found.');
  ensure(
    b.driverId === req.user!.id ||
      b.spot.ownerId === req.user!.id ||
      req.user!.roles.includes('ADMIN'),
    403,
    'This booking belongs to another user.',
  );
  res.json(await decorateBooking(b));
});
app.post('/api/bookings/:id/pay', requireAuth, async (req, res) =>
  res.json(await pay(req.user!, id(req), v.paymentSchema.parse(req.body))),
);
app.post('/api/bookings/:id/cancel', requireAuth, async (req, res) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(5).max(500) })
    .strict()
    .parse(req.body);
  res.json(await cancel(req.user!, id(req), reason));
});
app.post('/api/bookings/:id/accept', requireAuth, async (req, res) => {
  const b = await db.booking.findUnique({ where: { id: id(req) } });
  ensure(b?.driverId === req.user!.id, 403, 'This waiting-list entry belongs to another driver.');
  res.json(
    await reserve(
      req.user!,
      {
        parkingSpotId: b.parkingSpotId,
        vehicleId: b.vehicleId,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        idempotencyKey: `accept:${b.id}`,
      },
      b.id,
    ),
  );
});
app.post('/api/bookings/:id/actions/:action', requireAuth, async (req, res) => {
  const input = z
    .object({
      message: z.string().max(2000).optional(),
      departureVerified: z.boolean().optional(),
      absenceVerified: z.boolean().optional(),
      fineAmount: z.number().int().optional(),
      refundNoShow: z.boolean().optional(),
    })
    .strict()
    .parse(req.body);
  res.json(await bookingAction(req.user!, id(req), String(req.params.action), input));
});
app.post('/api/bookings/:id/review', requireAuth, async (req, res) => {
  const input = z
    .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(5).max(1000) })
    .strict()
    .parse(req.body);
  const b = await db.booking.findUnique({ where: { id: id(req) }, include: { spot: true } });
  ensure(
    b?.driverId === req.user!.id &&
      b.bookingStatus === 'COMPLETED' &&
      b.spot.ownerId !== req.user!.id,
    403,
    'Only the driver of a completed booking may review it.',
  );
  res.status(201).json(
    await db.review.create({
      data: {
        ...input,
        bookingId: b.id,
        parkingSpotId: b.parkingSpotId,
        reviewerId: req.user!.id,
      },
    }),
  );
});
app.get('/api/payments', requireAuth, async (req, res) =>
  res.json(
    await db.payment.findMany({
      where: {
        booking:
          req.query.scope === 'owner'
            ? { spot: { ownerId: req.user!.id } }
            : { driverId: req.user!.id },
      },
      include: { booking: { select: { id: true, spot: { select: { title: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
  ),
);
app.get('/api/admin/overview', requireAuth, role('ADMIN'), async (_req, res) => {
  const [users, spots, bookings, payments] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        roles: true,
        accountStatus: true,
        createdAt: true,
        audit: true,
      },
    }),
    db.parkingSpot.findMany({ include: { owner: { select: { fullName: true } } } }),
    db.booking.findMany({
      include: { ...bookingInclude, driver: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.payment.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({
    users,
    spots,
    bookings: await Promise.all(bookings.map(decorateBooking)),
    payments,
    stats: {
      users: users.length,
      spots: spots.length,
      bookings: bookings.length,
      revenue: payments
        .filter((p) => p.paymentStatus === 'SUCCESS')
        .reduce((s, p) => s + p.amount, 0),
      disputes: bookings.filter(
        (b) => (b.dispute as Record<string, unknown> | null)?.status === 'OPEN',
      ).length,
    },
  });
});
app.post('/api/admin/spots/:id', requireAuth, role('ADMIN'), async (req, res) => {
  const input = z
    .object({
      approvalStatus: z.enum(['APPROVED', 'REJECTED']),
      reason: z.string().min(5).max(500),
    })
    .strict()
    .parse(req.body);
  res.json(
    await transaction(async (tx) => {
      const s = await lockSpot(tx, id(req));
      ensure(s.permissionConfirmed, 409, 'Owner must confirm permission first.');
      return tx.parkingSpot.update({
        where: { id: s.id },
        data: {
          approvalStatus: input.approvalStatus,
          audit: appendAudit(s.audit, event(req.user!.id, 'APPROVAL_REVIEW', input)),
        },
      });
    }),
  );
});
app.post('/api/admin/users/:id', requireAuth, role('ADMIN'), async (req, res) => {
  const input = z
    .object({ accountStatus: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().min(5).max(500) })
    .strict()
    .parse(req.body);
  ensure(id(req) !== req.user!.id, 400, 'You cannot suspend your own administrator account.');
  const u = await db.user.findUnique({ where: { id: id(req) } });
  ensure(u, 404, 'User not found.');
  ensure(
    !u.roles.includes('ADMIN'),
    403,
    'Administrators cannot suspend peer administrators through this endpoint.',
  );
  res.json(
    publicUser(
      await db.user.update({
        where: { id: u.id },
        data: {
          accountStatus: input.accountStatus,
          sessionVersion: { increment: 1 },
          audit: appendAudit(u.audit, event(req.user!.id, 'ACCOUNT_STATUS', input)),
        },
      }),
    ),
  );
});
app.post('/api/demo/clock', requireAuth, role('ADMIN'), async (req, res) => {
  ensure(demo, 404, 'Demo controls are disabled.');
  const input = z
    .object({
      advanceMinutes: z.number().int().min(0).max(1440).optional(),
      reset: z.boolean().optional(),
    })
    .strict()
    .parse(req.body);
  res.json({
    serverTime: setDemoTime(
      input.reset
        ? undefined
        : new Date(+now() + (input.advanceMinutes ?? 0) * 60000).toISOString(),
    ),
  });
});
app.use((_req, _res, next) => next(new AppError(404, 'API endpoint not found.')));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({ error: 'Please check the submitted fields.', details: err.flatten() });
  if (err instanceof AppError)
    return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002')
      return res.status(409).json({ error: 'This record or idempotency key already exists.' });
    if (
      ['P2003', 'P2004', 'P2010', 'P2034'].includes(err.code) ||
      /exclusion|constraint|overlap/i.test(err.message)
    )
      return res.status(409).json({
        error:
          'This action conflicts with an existing reservation, schedule, or protected history. Refresh availability and try again.',
      });
  }
  if (err instanceof multer.MulterError)
    return res.status(400).json({ error: 'Image must be a single file under 5 MB.' });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' });
  console.error('Request failed:', err instanceof Error ? err.name : 'Unknown error');
  res.status(500).json({ error: 'The request could not be completed. Please try again.' });
});
