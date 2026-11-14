import bcrypt from 'bcryptjs';
import { requireHostedDatabase } from './hosted-database.js';

const bootstrapEvent = 'HOSTED_DEMO_BOOTSTRAPPED';
const identities = [
  {
    email: 'driver@driveshare.demo',
    fullName: 'Riya Sharma',
    roles: ['DRIVER'],
    passwordKey: 'DRIVESHARE_ONLINE_DRIVER_PASSWORD',
  },
  {
    email: 'owner@driveshare.demo',
    fullName: 'Meera Nair',
    roles: ['DRIVER', 'OWNER'],
    passwordKey: 'DRIVESHARE_ONLINE_HOST_PASSWORD',
  },
  {
    email: 'admin@driveshare.demo',
    fullName: 'Aditi Rao',
    roles: ['ADMIN'],
    passwordKey: 'DRIVESHARE_ONLINE_ADMIN_PASSWORD',
  },
];

async function bootstrap() {
  requireHostedDatabase();
  if (process.env.DRIVESHARE_BOOTSTRAP !== 'true')
    throw new Error(
      'Set DRIVESHARE_BOOTSTRAP=true to provision the hosted demonstration accounts.',
    );

  const passwords = identities.map(({ passwordKey }) => {
    const password = process.env[passwordKey];
    if (
      !password ||
      [...password].length < 16 ||
      Buffer.byteLength(password) > 72 ||
      !password.trim()
    )
      throw new Error(`${passwordKey} needs at least 16 characters and at most 72 UTF-8 bytes.`);
    return password;
  });
  if (new Set(passwords).size !== identities.length || passwords.includes('DriveShareDemo!23'))
    throw new Error(
      'Use a different password for each hosted account and keep the local password separate.',
    );

  const { db } = await import('../src/db.js');
  const { campusSpaces } = await import('./campus-seed.js');
  try {
    const created = await db.$transaction(
      async (tx) => {
        const existing = await tx.user.findMany({
          where: { email: { in: identities.map(({ email }) => email) } },
          select: { audit: true },
        });
        if (existing.length) {
          if (
            existing.length === identities.length &&
            existing.every(
              ({ audit }) =>
                Array.isArray(audit) &&
                audit.some(
                  (event) =>
                    event &&
                    typeof event === 'object' &&
                    'action' in event &&
                    event.action === bootstrapEvent,
                ),
            )
          )
            return false;
          throw new Error(
            'A demonstration email already exists without a complete hosted bootstrap.',
          );
        }
        if (await tx.parkingSpot.count())
          throw new Error(
            'Hosted bootstrap expects an empty parking inventory to protect existing listings.',
          );

        const timestamp = new Date().toISOString();
        const [driver, host] = await Promise.all(
          identities.map(async ({ email, fullName, roles }, index) =>
            tx.user.create({
              data: {
                email,
                fullName,
                roles,
                passwordHash: await bcrypt.hash(passwords[index], 12),
                emailVerified: true,
                audit: [{ action: bootstrapEvent, at: timestamp }],
              },
            }),
          ),
        );
        await tx.vehicle.create({
          data: {
            userId: driver.id,
            registrationNumber: 'DEMO KA 03 AB 1203',
            vehicleType: 'CAR',
            vehicleModel: 'Maruti Swift (demo)',
          },
        });
        await campusSpaces(tx, [host.id]);
        return true;
      },
      { timeout: 30000 },
    );
    console.log(
      created
        ? 'Created hosted driver, host, admin, vehicle and fictional parking fixtures.'
        : 'Hosted demonstration accounts already exist. Existing data was retained.',
    );
  } finally {
    await db.$disconnect();
  }
}

await bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Hosted bootstrap failed.');
  process.exitCode = 1;
});
