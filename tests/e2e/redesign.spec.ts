import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { istParts, istToISO } from '../../apps/web/src/booking-time';
const base = 'http://localhost:5174';
let browserErrors: string[] = [];
async function offline(context: BrowserContext) {
  await context.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  const watch = (p: Page) => p.on('pageerror', (e) => browserErrors.push(e.message));
  context.pages().forEach(watch);
  context.on('page', watch);
}
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@driveshare.demo`);
  await page.getByLabel('Password', { exact: true }).fill('DriveShareDemo!23');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My profile', exact: true })).toBeVisible();
}
test.beforeEach(async ({ context }) => {
  browserErrors = [];
  await offline(context);
  await mkdir('docs/screenshots', { recursive: true });
  await mkdir('.local', { recursive: true });
});
test.afterEach(() => expect(browserErrors, 'No uncaught browser errors').toEqual([]));
test('search, IST calendar, every duration shortcut, editable checkout and interval retention', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Park nearby. Get on with your day.' }),
  ).toBeVisible();
  const tomorrow = istParts(new Date(Date.now() + 86400000)).date;
  await page.getByLabel('Check-in date', { exact: true }).fill(tomorrow);
  await page.getByLabel('Check-in time (24-hour IST)', { exact: true }).selectOption('10:00');
  for (const h of [1, 2, 4, 8, 12, 24]) {
    await page
      .getByRole('button', { name: `${h} ${h === 1 ? 'Hour' : 'Hours'}`, exact: true })
      .click();
    const expected = istParts(new Date(+new Date(istToISO(tomorrow, '10:00')) + h * 3600000));
    await expect(page.getByLabel('Check-out date', { exact: true })).toHaveValue(expected.date);
    await expect(page.getByLabel('Check-out time (24-hour IST)', { exact: true })).toHaveValue(
      expected.time,
    );
  }
  await page.getByLabel('Check-out time (24-hour IST)', { exact: true }).selectOption('09:30');
  await expect(page.getByRole('button', { name: 'Custom', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('23h 30m total')).toBeVisible();
  await page.getByRole('button', { name: '24 Hours', exact: true }).click();
  const card = page
    .locator('.parking-card')
    .filter({ has: page.getByRole('heading', { name: 'Riverside Court', exact: true }) });
  await expect(card.getByText('₹840 for 24h')).toBeVisible();
  await card.getByRole('link', { name: 'View details' }).click();
  const params = new URL(page.url()).searchParams;
  expect(params.get('start')).toBe(istToISO(tomorrow, '10:00'));
  expect(+new Date(params.get('end')!) - +new Date(params.get('start')!)).toBe(86400000);
  await expect(page.getByRole('heading', { name: 'Your space is one step away.' })).toBeVisible();
  await expect(page.locator('.review-total')).toHaveText('₹840');
  await expect(page.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
    'href',
    /maps\/dir\/\?api=1&destination=/,
  );
});
test('driver-to-host 24-hour booking, exact ID, persistent notices, cancellation and release', async ({
  browser,
}) => {
  const started = Date.now();
  const driverContext = await browser.newContext({
    baseURL: base,
    timezoneId: 'America/Los_Angeles',
    viewport: { width: 1440, height: 1000 },
  });
  const hostContext = await browser.newContext({
    baseURL: base,
    viewport: { width: 1440, height: 1000 },
  });
  await offline(driverContext);
  await offline(hostContext);
  const driver = await driverContext.newPage(),
    host = await hostContext.newPage();
  try {
    await login(host, 'owner');
    const earnings = host
      .locator('.stat')
      .filter({ hasText: 'Net demo earnings' })
      .locator('strong');
    const readEarnings = async () => Number((await earnings.innerText()).replace(/[^\d.-]/g, ''));
    await expect(earnings).toHaveText(/^₹/);
    const initialEarnings = await readEarnings();
    await login(driver, 'driver');
    await driver.goto('/');
    const start = istParts(new Date(Date.now() + 86400000)).date;
    const time = '10:00';
    await driver.getByLabel('Check-in date', { exact: true }).fill(start);
    await driver.getByLabel('Check-in time (24-hour IST)', { exact: true }).selectOption(time);
    await driver.getByRole('button', { name: '24 Hours', exact: true }).click();
    const space = driver
      .locator('.parking-card')
      .filter({ has: driver.getByRole('heading', { name: 'Riverside Court', exact: true }) });
    await space.getByRole('link', { name: 'View details' }).click();
    await expect(driver.locator('.review-total')).toHaveText('₹840');
    await driver.screenshot({ path: 'docs/screenshots/review-desktop.png', fullPage: true });
    await driver.getByRole('button', { name: 'Confirm demo booking', exact: true }).click();
    await expect(driver.getByRole('heading', { name: 'You’re booked.' })).toBeVisible();
    const id = await driver.getByTestId('confirmed-booking-id').innerText();
    expect(id).toMatch(/^[\da-f-]{36}$/);
    const bookingMs = Date.now() - started;
    expect(bookingMs).toBeLessThan(60000);
    await driver.screenshot({ path: 'docs/screenshots/confirmation-desktop.png', fullPage: true });
    const received = host.locator('.host-booking-card').filter({ hasText: id });
    await expect(received).toBeVisible({ timeout: 15000 });
    await expect(received).toContainText('Riya Sharma');
    await expect(received).toContainText('Riverside Court');
    await expect(received).toContainText(time);
    await expect(received).toContainText('24h · ₹840');
    await expect(received.locator('.badge')).toHaveText('confirmed');
    await expect.poll(readEarnings, { timeout: 15000 }).toBeCloseTo(initialEarnings + 840);
    await host.screenshot({ path: 'docs/screenshots/host-desktop.png', fullPage: true });
    await received.getByRole('link', { name: 'View details' }).click();
    await expect(host.locator('.booking-detail-id')).toHaveText(id);
    await expect(host.getByText('Driver: Riya Sharma', { exact: true })).toBeVisible();
    await host.goto('/notifications');
    await expect(
      host.locator('.notification-card').filter({ hasText: `New confirmed booking ${id}` }),
    ).toBeVisible();
    await driver.getByRole('link', { name: 'View booking', exact: true }).click();
    driver.on('dialog', (d) =>
      d.type() === 'prompt'
        ? d.accept('Connected driver-host cancellation demonstration')
        : d.accept(),
    );
    await driver.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await expect(driver.locator('.page-title .badge')).toHaveText('cancelled');
    await expect(driver.locator('.payment-mini').filter({ hasText: 'refund' })).toContainText(
      '-₹840',
    );
    await host.goto('/owner');
    const cancelled = host.locator('.host-booking-card').filter({ hasText: id });
    await expect(cancelled.locator('.badge')).toHaveText('cancelled');
    await expect.poll(readEarnings, { timeout: 15000 }).toBeCloseTo(initialEarnings);
    await host.goto('/notifications');
    await expect(
      host.locator('.notification-card').filter({ hasText: `Booking ${id} cancelled.` }),
    ).toBeVisible();
    await driver.goto(
      `/?${new URLSearchParams({ q: 'Adyar', start: istToISO(start, time), end: new Date(+new Date(istToISO(start, time)) + 86400000).toISOString(), vehicleType: 'CAR' })}`,
    );
    await expect(
      driver
        .locator('.parking-card')
        .filter({ has: driver.getByRole('heading', { name: 'Riverside Court', exact: true }) })
        .getByText('Available for your times'),
    ).toBeVisible();
    await writeFile(
      '.local/redesign-demo-evidence.json',
      JSON.stringify({
        bookingId: id,
        driver: 'driver@driveshare.demo',
        host: 'owner@driveshare.demo',
        bookingMs,
        cancellation: 'observed by host',
        release: 'verified',
        timezone: 'America/Los_Angeles browser, IST booking',
      }),
    );
  } finally {
    await driverContext.close();
    await hostContext.close();
  }
});
test('registration, profile, garage and secure navigation', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Playwright Neighbor');
  await page.getByLabel('Email address').fill(`browser-${Date.now()}@driveshare.demo`);
  await page.getByLabel('Password', { exact: true }).fill('BrowserDemo!123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByRole('link', { name: 'My profile', exact: true })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Playwright Neighbor' })).toBeVisible();
  await page.getByRole('link', { name: /My vehicles/ }).click();
  await page.getByLabel('Vehicle model').fill('Browser Swift');
  await page.getByLabel('Registration number').fill('DEMO E2E 1234');
  await page.getByRole('button', { name: 'Add to my garage' }).click();
  await expect(page.getByRole('heading', { name: 'Browser Swift' })).toBeVisible();
});
test('live-map failure, marker selection and list/map controls preserve bookings', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Offline map · illustration')).toBeVisible();
  await expect(
    page.getByText('Live tiles unavailable. Local illustration shown; booking still works.'),
  ).toBeVisible();
  const card = page
    .locator('.parking-card')
    .filter({ has: page.getByRole('heading', { name: 'Riverside Court', exact: true }) });
  await card.getByRole('button', { name: 'Show Riverside Court on map' }).click();
  await expect(card).toHaveClass(/selected/);
  const marker = page.locator('.price-pin.active');
  await expect(marker).toHaveText('₹35');
  await marker.click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText('Riverside Court');
  await expect(popup.getByRole('link', { name: /View details & book/ })).toHaveAttribute(
    'href',
    /\/explore\/5a7ad000-0000-4000-8000-000000000005\?/,
  );
  await page.getByRole('combobox', { name: 'Maximum hourly price' }).selectOption('25');
  await expect(page.getByRole('heading', { name: '0 available spaces near campus' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Available only' }).uncheck();
  await expect(
    page.getByRole('heading', { name: 'College Road Parking', exact: true }),
  ).toBeVisible();
  const prices = await page.locator('.parking-card-bottom>div>strong').allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  expect(prices.every((p) => Number(p.replace(/[^\d.]/g, '')) <= 25)).toBe(true);
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4f2ee"/></svg>',
    }),
  );
  await page.getByRole('button', { name: 'Retry live map' }).click();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeVisible();
});
test('payment failure and retry remain available for reservation holds', async ({ page }) => {
  await login(page, 'driver4');
  const me = await (await page.request.get('/api/auth/me')).json();
  const spaces = await (await page.request.get('/api/spots?q=Adyar')).json();
  const spot = spaces.find((s: { title: string }) => s.title === 'Palm Grove Parking');
  const vehicle = (await (await page.request.get('/api/vehicles')).json())[0];
  const start = new Date(Date.now() + 4 * 3600000);
  const r = await page.request.post('/api/bookings', {
    headers: { Origin: base, 'X-CSRF-Token': me.csrf },
    data: {
      parkingSpotId: spot.id,
      vehicleId: vehicle.id,
      startTime: start.toISOString(),
      endTime: new Date(+start + 3600000).toISOString(),
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(r.status()).toBe(201);
  const hold = await r.json();
  await page.goto(`/pay/${hold.id}`);
  await page.getByRole('button', { name: 'Simulate Payment Failure' }).click();
  await expect(page.getByRole('alert')).toContainText('Simulated payment failed');
  await page.getByRole('button', { name: 'Complete Demo Payment' }).click();
  await expect(page.locator('.page-title .badge')).toHaveText('confirmed');
});
test('host recurring schedule save and existing ownership workflows', async ({ page }) => {
  await login(page, 'owner');
  await page.getByRole('link', { name: 'My parking spaces', exact: true }).click();
  await page.getByRole('link', { name: 'Availability', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: 'Day', exact: true })).toHaveCount(7);
  await page.getByRole('button', { name: 'Save recurring hours' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Recurring availability saved.' }),
  ).toBeVisible();
});
test('administrator approval and dispute controls remain functional', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Listing approvals', exact: true }).click();
  const card = page
    .locator('.owner-spot')
    .filter({ has: page.getByRole('heading', { name: 'The Quiet Driveway', exact: true }) });
  await expect(card.locator('.badge')).toHaveText('pending');
  page.on('dialog', (d) => d.accept('Permission and fictional listing reviewed.'));
  await card.getByRole('button', { name: 'Approve listing' }).click();
  await expect(card.locator('.badge')).toHaveText('approved');
  await page.getByRole('link', { name: 'Disputes', exact: true }).click();
  await expect(
    page.getByText(
      'The host was delayed confirming my departure. Please review this demonstration fine.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record resolution' }).first()).toBeVisible();
});
for (const [name, width, height] of [
  ['iphone', 375, 812],
  ['android', 393, 873],
  ['tablet', 768, 1024],
  ['laptop', 1280, 800],
  ['desktop', 1536, 960],
] as const) {
  test(`responsive ${name}: search, date controls, navigation and no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByLabel('Check-in date', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '24 Hours', exact: true }).click();
    await expect(page.getByText('24h total')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width < 700) {
      const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
      await expect(mobile.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await expect(page.locator('.parking-map')).toBeVisible();
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await expect(page.locator('.parking-card').first()).toBeVisible();
      await expect(page.locator('.parking-map')).not.toBeVisible();
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `docs/screenshots/search-${name}.png`, fullPage: width >= 700 });
    if (name === 'iphone') {
      await page
        .locator('.parking-card')
        .first()
        .getByRole('link', { name: 'View details' })
        .click();
      const confirm = page.getByRole('button', { name: 'Sign in to book', exact: true });
      await expect(confirm).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await confirm.scrollIntoViewIfNeeded();
      await expect(confirm).toBeInViewport();
      await page.screenshot({ path: 'docs/screenshots/review-iphone.png' });
    }
  });
}
