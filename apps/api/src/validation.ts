import { z } from 'zod';
import { DateTime } from 'luxon';
export const uuid = z.uuid();
export const key = z
  .string()
  .min(8)
  .max(150)
  .regex(/^[\w:-]+$/);
export const iso = z.iso.datetime({ offset: true });
export const registration = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(10)
      .max(72)
      .refine(
        (v) => Buffer.byteLength(v, 'utf8') <= 72,
        'Password may contain at most 72 UTF-8 bytes.',
      ),
    phone: z.string().max(20).default(''),
    owner: z.boolean().default(false),
  })
  .strict();
export const login = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(72),
  })
  .strict();
export const demoLogin = z
  .object({
    role: z.enum(['driver', 'owner', 'admin']),
  })
  .strict();
export const vehicleSchema = z
  .object({
    registrationNumber: z
      .string()
      .trim()
      .min(4)
      .max(20)
      .transform((v) => v.toUpperCase()),
    vehicleType: z.enum(['CAR', 'TWO_WHEELER']),
    vehicleModel: z.string().trim().min(2).max(80),
  })
  .strict();
export const spotSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(3000),
    address: z.string().trim().min(8).max(300),
    city: z.string().trim().min(2).max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezone: z
      .string()
      .refine((v) => DateTime.now().setZone(v).isValid, 'Choose a valid IANA time zone.')
      .default('Asia/Kolkata'),
    hourlyPrice: z.number().int().min(100).max(100000),
    vehicleTypes: z
      .array(z.enum(['CAR', 'TWO_WHEELER']))
      .min(1)
      .max(2),
    parkingType: z.enum(['COVERED', 'OPEN', 'GATED']),
    spotNumber: z.string().min(1).max(40),
    accessInstructions: z.string().min(5).max(1000),
    images: z
      .array(
        z.string().regex(/^(\/uploads\/[\w.-]+\.(jpg|jpeg|png|webp)|\/demo\/parking-[123]\.svg)$/),
      )
      .max(6)
      .default([]),
    permissionConfirmed: z.literal(true),
    isActive: z.boolean().default(true),
  })
  .strict();
const date = z.iso.date();
export const scheduleSchema = z
  .object({
    slots: z
      .array(
        z
          .object({
            dayOfWeek: z.number().int().min(0).max(6),
            startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            endTime: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/),
            effectiveFrom: date,
            effectiveUntil: date.nullable().default(null),
            isActive: z.boolean().default(true),
          })
          .strict()
          .refine(
            (v) =>
              v.startTime < v.endTime && (!v.effectiveUntil || v.effectiveUntil >= v.effectiveFrom),
            'Invalid schedule interval.',
          ),
      )
      .max(70),
  })
  .strict();
export const reserveSchema = z
  .object({
    parkingSpotId: uuid,
    vehicleId: uuid,
    startTime: iso,
    endTime: iso,
    idempotencyKey: key,
    waitlist: z.boolean().default(false),
  })
  .strict();
export const paymentSchema = z
  .object({
    idempotencyKey: key,
    method: z.enum(['DEMO_UPI', 'DEMO_CARD', 'DEMO_CASH']),
    outcome: z.enum(['success', 'failure']),
    type: z.enum(['BOOKING', 'OVERSTAY_FINE']).default('BOOKING'),
  })
  .strict();
export const blockSchema = z
  .object({
    startTime: iso,
    endTime: iso,
    reason: z.string().trim().min(5).max(500),
    resolveBookings: z.boolean().default(false),
    affectedBookingIds: z.array(uuid).default([]),
  })
  .strict();
