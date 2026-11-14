import type { Tx } from '../src/db.js';
import { campus } from '../src/campus.js';
import { now } from '../src/clock.js';

export async function campusSpaces(tx: Tx, owners: string[]) {
  const names = [
    'Sahyadri Gate Courtyard',
    'Adyar Garden Residence',
    'College Road Parking',
    'The Banyan House',
    'Riverside Court',
    'Adyar Scooter Corner',
    'Palm Grove Parking',
    'The Quiet Driveway',
  ];
  const offsets = [
    [0.0005, 0.0013],
    [0.0014, 0.0018],
    [0.0021, -0.001],
    [-0.0002, 0.0028],
    [0.0017, 0.0038],
    [0.003, 0.002],
    [0.0028, -0.0025],
    [-0.001, 0.004],
  ];
  const spots = [];
  for (let i = 0; i < 8; i++) {
    const id = `5a7ad000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    let spot = await tx.parkingSpot.findUnique({ where: { id } });
    // Only repair untouched, unbooked fixtures; never transfer booked/edited spaces.
    if (
      spot &&
      spot.ownerId !== owners[i % owners.length] &&
      Array.isArray(spot.audit) &&
      spot.audit.length === 1 &&
      (spot.audit[0] as { action?: string })?.action === 'SAHYADRI_DEMO_SEEDED' &&
      (await tx.booking.count({ where: { parkingSpotId: id } })) === 0
    ) {
      spot = await tx.parkingSpot.update({
        where: { id },
        data: { ownerId: owners[i % owners.length] },
      });
    }
    if (!spot) {
      spot = await tx.parkingSpot.create({
        data: {
          id,
          ownerId: owners[i % owners.length],
          title: names[i],
          description:
            'Fictional demonstration parking near Sahyadri College, Adyar. This illustrated listing is not a real commercial facility or an offer to enter private property.',
          address: `Demo Bay ${i + 1}, ${i % 2 ? 'Adyar neighbourhood' : 'College Road'}, near Sahyadri College, Adyar, Mangaluru 575007 (fictional demo)`,
          city: campus.city,
          latitude: campus.latitude + offsets[i][0],
          longitude: campus.longitude + offsets[i][1],
          timezone: campus.timezone,
          hourlyPrice: [4000, 6000, 2500, 5000, 3500, 2000, 7500, 3000][i],
          vehicleTypes: i === 5 ? ['TWO_WHEELER'] : ['CAR', 'TWO_WHEELER'],
          parkingType: ['COVERED', 'GATED', 'OPEN', 'COVERED', 'GATED', 'OPEN', 'COVERED', 'OPEN'][
            i
          ],
          spotNumber: `DEMO-${i + 1}`,
          accessInstructions:
            'Fictional demo location. In a real booking, meet the host and verify the marked bay; host confirms arrival and departure.',
          images: [`/demo/parking-${(i % 3) + 1}.svg`],
          approvalStatus: i === 7 ? 'PENDING' : 'APPROVED',
          permissionConfirmed: true,
          audit: [{ action: 'SAHYADRI_DEMO_SEEDED', at: now().toISOString() }],
        },
      });
      await tx.availabilitySlot.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          parkingSpotId: id,
          dayOfWeek,
          startTime: '00:00',
          endTime: '24:00',
          effectiveFrom: new Date('2020-01-01'),
          effectiveUntil: new Date('2099-12-31'),
        })),
      });
    }
    spots.push(spot);
  }
  return spots;
}
