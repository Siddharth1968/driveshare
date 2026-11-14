import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { chromium, expect } from '@playwright/test';

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const day = 86_400_000;
const spotName = 'Riverside Court';
const reason = 'Completed the isolated hosted DriveShare smoke check.';
const rehearsal = process.env.DRIVESHARE_HOSTED_REHEARSAL === 'true';
const productionCheck = process.env.DRIVESHARE_VERIFY_PRODUCTION === 'true';
const productionHost = 'driveshare-two.vercel.app';
const passwords = {
  driver: process.env.DRIVESHARE_ONLINE_DRIVER_PASSWORD,
  owner: process.env.DRIVESHARE_ONLINE_HOST_PASSWORD,
  admin: process.env.DRIVESHARE_ONLINE_ADMIN_PASSWORD,
};
const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function targetOrigin() {
  let url;
  try {
    url = new URL(process.env.DRIVESHARE_STAGING_URL);
  } catch {
    throw new Error('Set DRIVESHARE_STAGING_URL to an HTTPS staging origin.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  assert.ok(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash,
    'Use an HTTPS origin with no credentials, path, query or fragment.',
  );
  if (productionCheck) {
    assert.ok(
      !rehearsal && url.origin === 'https://' + productionHost,
      'The explicit production check only supports the original DriveShare domain.',
    );
  } else {
    assert.notEqual(hostname, productionHost, 'The production hostname requires explicit opt-in.');
  }
  if (rehearsal) {
    assert.equal(url.origin, 'https://localhost:5180', 'Rehearsal is limited to localhost:5180.');
  } else {
    assert.ok(
      hostname.includes('.') && !hostname.endsWith('.localhost') && !isIP(hostname) && !url.port,
      'Use a public staging hostname on the standard HTTPS port.',
    );
  }
  return url.origin;
}

const check = expect.configure({ timeout: 20_000 });
const get = (page, path, options) => page.request.get(path, { ...options, maxRedirects: 0 });
const spotCard = (page) =>
  page
    .locator('.parking-card')
    .filter({ has: page.getByRole('heading', { name: spotName, exact: true }) });

async function login(page, role, path, hostname) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(role + '@driveshare.demo');
  try {
    await page.getByLabel('Password', { exact: true }).fill(passwords[role]);
  } catch {
    throw new Error('The ' + role + ' password field could not be filled.');
  }
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, 'Login failed for ' + role + '.');
  const setCookie = await response.headerValue('set-cookie');
  assert.ok(
    setCookie && /(?:^|\n)driveshare_session=/.test(setCookie) && !/;\s*Domain=/i.test(setCookie),
    'The server must issue a host-only session cookie.',
  );
  const cookie = (await page.context().cookies()).find((c) => c.name === 'driveshare_session');
  assert.ok(
    cookie?.domain === hostname &&
      cookie.path === '/' &&
      cookie.secure &&
      cookie.httpOnly &&
      cookie.sameSite === 'Lax',
    'The browser must store a Secure, HttpOnly, SameSite=Lax session on the staging host.',
  );
  await check(page).toHaveURL(new URL(path, page.url()).href);
}

async function verifyDemoButtons(page, origin) {
  const buttons = [
    ['🚗 Driver Demo', '/'],
    ['🏠 Host Demo', '/owner'],
    ['🛡️ Admin Demo', '/admin'],
  ];
  for (const [label, expectedPath] of buttons) {
    await page.goto('/login');
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/auth/demo-login' && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: label, exact: true }).click(),
    ]);
    assert.equal(response.status(), 200, label + ' one-click login failed.');
    await check(page).toHaveURL(new URL(expectedPath, page.url()).href);
    if (expectedPath === '/admin') {
      await check(page.getByTestId('admin-showcase-banner')).toBeVisible();
      const me = await get(page, '/api/auth/me');
      const { csrf, user } = await me.json();
      assert.equal(user?.showcase, true, 'Admin demo must set showcase mode.');
      const blocked = await page.request.post('/api/admin/users/' + user.id, {
        headers: { Origin: origin, 'X-CSRF-Token': csrf },
        data: { accountStatus: 'SUSPENDED', reason: 'Showcase write check' },
        maxRedirects: 0,
      });
      assert.equal(blocked.status(), 403, 'Restricted admin demo must reject mutations.');
    }
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await check(page).toHaveURL(new URL('/login', page.url()).href);
  }
}

async function verifyShell(page) {
  const root = await page.goto('/');
  assert.equal(root?.status(), 200, 'The staging home page must return HTTP 200.');
  await check(
    page.getByRole('heading', { name: 'Park nearby. Get on with your day.' }),
  ).toBeVisible();

  const assets = await page
    .locator('script[type="module"][src], link[rel="stylesheet"][href]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.src || node.href)
        .filter((url) => new URL(url).origin === location.origin),
    );
  assert.ok(
    assets.some((url) => new URL(url).pathname.endsWith('.js')),
    'Built JavaScript is missing.',
  );
  assert.ok(
    assets.some((url) => new URL(url).pathname.endsWith('.css')),
    'Built CSS is missing.',
  );
  for (const url of assets) {
    const asset = await get(page, url);
    const mime = new URL(url).pathname.endsWith('.css') ? /text\/css/ : /javascript/;
    assert.ok(
      asset.ok() && mime.test(asset.headers()['content-type'] ?? ''),
      'A frontend asset failed to load.',
    );
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  const health = await get(page, '/api/health', { timeout: 125_000 });
  assert.equal(health.status(), 200, 'Staging backend health failed.');
  assert.match(health.headers()['content-type'] ?? '', /application\/json/i);
  assert.match(health.headers()['cache-control'] ?? '', /\bno-store\b/i);
  assert.equal(
    (await health.json()).status,
    'ok',
    'The backend did not report a healthy database.',
  );
}

async function verifyUpload(host, origin) {
  const session = await get(host, '/api/auth/me');
  assert.equal(session.status(), 200);
  const { csrf } = await session.json();
  assert.ok(csrf, 'Host did not receive a CSRF token.');
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XKJkAAAAASUVORK5CYII=',
    'base64',
  );
  const saved = await host.request.post('/api/uploads', {
    headers: { Origin: origin, 'X-CSRF-Token': csrf },
    multipart: { image: { name: 'smoke.png', mimeType: 'image/png', buffer: bytes } },
    maxRedirects: 0,
  });
  assert.equal(saved.status(), 201, 'Host image upload failed.');
  const { url } = await saved.json();
  assert.match(url, /^\/uploads\/[\da-f-]{36}\.png$/);
  const image = await get(host, url);
  assert.equal(image.status(), 200);
  assert.match(image.headers()['content-type'] ?? '', /^image\/png/);
  assert.deepEqual(await image.body(), bytes, 'Stored image content changed.');
  console.log('Verified hosted image ' + url + '.');
}

async function availableInterval(page) {
  const config = await get(page, '/api/config');
  assert.equal(config.status(), 200, 'Staging app configuration is unavailable.');
  const { serverTime, demo } = await config.json();
  assert.equal(demo, false, 'Hosted demo clock controls must be disabled.');
  const clock = Date.parse(serverTime);
  assert.ok(Number.isFinite(clock), 'Staging server did not report a valid clock.');
  for (let offset = 1; offset <= 7; offset++) {
    const checkIn = dateFormat.format(new Date(clock + offset * day));
    const checkOut = dateFormat.format(new Date(clock + (offset + 1) * day));
    const start = new Date(checkIn + 'T10:00:00+05:30').toISOString();
    const end = new Date(checkOut + 'T10:00:00+05:30').toISOString();
    const params = new URLSearchParams({ q: 'Adyar', start, end, vehicleType: 'CAR' });
    const response = await get(page, '/api/spots?' + params);
    assert.equal(response.status(), 200, 'Staging availability search failed.');
    const spot = (await response.json()).find((s) => s.title === spotName);
    assert.ok(spot, spotName + ' is missing from the staging inventory.');
    if (spot.available) return { checkIn, checkOut, params, spotId: spot.id, start, end };
  }
  throw new Error('No 24-hour interval at Riverside Court is available in the next seven days.');
}

async function cancelIfNeeded(page, bookingId, requestKey, origin) {
  if (!bookingId && !requestKey) return;
  const me = await get(page, '/api/auth/me');
  if (!me.ok()) throw new Error('Could not authenticate for booking cleanup.');
  const { csrf, user } = await me.json();
  assert.ok(csrf && user?.id, 'Could not authenticate for booking cleanup.');
  const response = await get(page, bookingId ? '/api/bookings/' + bookingId : '/api/bookings');
  assert.ok(response.ok(), 'Could not read the smoke booking for cleanup.');
  const body = await response.json();
  const bookings = Array.isArray(body) ? body : [body];
  const booking = bookings.find((b) =>
    bookingId ? b.id === bookingId : b.idempotencyKey === user.id + ':' + requestKey,
  );
  if (!booking || !['PAYMENT_PENDING', 'CONFIRMED'].includes(booking.bookingStatus)) return;
  assert.match(booking.id, uuid);
  const cancelled = await page.request.post('/api/bookings/' + booking.id + '/cancel', {
    headers: { Origin: origin, 'X-CSRF-Token': csrf },
    data: { reason },
    maxRedirects: 0,
  });
  assert.ok(cancelled.ok(), 'Could not cancel the smoke booking during cleanup.');
}

async function run() {
  const origin = targetOrigin();
  const hostname = new URL(origin).hostname;
  assert.ok(
    Object.values(passwords).every(Boolean),
    'Set the three hosted demo password variables.',
  );
  const browser = await chromium.launch();
  const browserErrors = [];
  async function newPage(viewport, isMobile = false) {
    const context = await browser.newContext({
      baseURL: origin,
      ignoreHTTPSErrors: rehearsal,
      viewport,
      isMobile,
      hasTouch: isMobile,
      timezoneId: isMobile ? 'America/Los_Angeles' : 'Asia/Kolkata',
      serviceWorkers: 'block',
    });
    // Keep credentials and browser traffic on staging, and avoid third-party tile requests.
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);
    page.on('pageerror', () => browserErrors.push(new URL(page.url()).pathname));
    return page;
  }

  let driver, bookingId, requestKey;
  let cancelled = false;
  try {
    driver = await newPage({ width: 390, height: 844 }, true);
    const host = await newPage({ width: 1440, height: 1000 });
    const admin = await newPage({ width: 1440, height: 1000 });
    await verifyShell(driver);
    await verifyDemoButtons(driver, origin);
    await login(driver, 'driver', '/', hostname);
    await login(host, 'owner', '/owner', hostname);
    await check(host.getByRole('heading', { name: 'Welcome home, Meera.' })).toBeVisible();
    await verifyUpload(host, origin);
    await login(admin, 'admin', '/admin', hostname);
    await check(admin.getByRole('heading', { name: 'A clearer view.' })).toBeVisible();
    assert.equal(
      (await get(driver, '/api/admin/overview')).status(),
      403,
      'Driver was granted admin access.',
    );

    const { checkIn, checkOut, params, spotId, start, end } = await availableInterval(driver);
    await driver.getByLabel('Search location').fill('Adyar');
    await driver.getByLabel('Vehicle type').selectOption('CAR');
    await driver.getByLabel('Check-in date', { exact: true }).fill(checkIn);
    await driver.getByLabel('Check-in time (24-hour IST)', { exact: true }).selectOption('10:00');
    await driver.getByRole('button', { name: '24 Hours', exact: true }).click();
    await check(driver.getByLabel('Check-out date', { exact: true })).toHaveValue(checkOut);
    await check(driver.getByLabel('Check-out time (24-hour IST)', { exact: true })).toHaveValue(
      '10:00',
    );
    await driver.getByRole('button', { name: 'Find parking', exact: true }).click();
    await driver.getByRole('button', { name: 'Map', exact: true }).click();
    await check(driver.locator('.parking-map .leaflet-marker-icon').first()).toBeVisible();
    await driver.getByRole('button', { name: 'List', exact: true }).click();
    await spotCard(driver).getByRole('link', { name: 'View details' }).click();
    const review = new URL(driver.url());
    assert.equal(review.pathname, '/explore/' + spotId);
    assert.equal(review.searchParams.get('start'), start);
    assert.equal(review.searchParams.get('end'), end);
    assert.equal(
      (await driver.reload())?.status(),
      200,
      'Refreshing the React detail route failed.',
    );
    await check(driver.locator('.review-total')).toHaveText('₹840');

    driver.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/bookings') {
        try {
          const key = request.postDataJSON()?.idempotencyKey;
          if (typeof key === 'string') requestKey = key;
        } catch {
          // Cleanup can still use the confirmed booking ID when the response is available.
        }
      }
    });
    const [reserved] = await Promise.all([
      driver.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/bookings' && r.request().method() === 'POST',
      ),
      driver.getByRole('button', { name: 'Confirm demo booking', exact: true }).click(),
    ]);
    assert.equal(reserved.status(), 201, 'The browser could not reserve the spot.');
    bookingId = (await reserved.json()).id;
    assert.match(bookingId, uuid);
    await check(driver.getByRole('heading', { name: 'You’re booked.' })).toBeVisible();
    await check(driver.getByTestId('confirmed-booking-id')).toHaveText(bookingId);

    const received = host.locator('.host-booking-card').filter({ hasText: bookingId });
    await check(received.locator('.badge')).toHaveText('confirmed');
    await check(received).toContainText('Riya Sharma');
    await check(received).toContainText(spotName);
    await check(received).toContainText('24h · ₹840');
    await received.getByRole('link', { name: 'View details' }).click();
    await check(host.locator('.booking-detail-id')).toHaveText(bookingId);
    const saved = await get(host, '/api/bookings/' + bookingId);
    assert.equal(saved.status(), 200, 'The host could not read the saved booking.');
    const booking = await saved.json();
    assert.equal(booking.startTime, start);
    assert.equal(booking.endTime, end);

    await driver.getByRole('link', { name: 'View booking', exact: true }).click();
    driver.on('dialog', (dialog) =>
      dialog.type() === 'prompt' ? dialog.accept(reason) : dialog.accept(),
    );
    await driver.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await check(driver.locator('.page-title .badge')).toHaveText('cancelled');
    cancelled = true;
    await check(driver.locator('.payment-mini').filter({ hasText: 'refund' })).toContainText(
      '-₹840',
    );
    await host.goto('/owner');
    await check(received.locator('.badge')).toHaveText('cancelled');
    await host.goto('/notifications');
    await check(
      host
        .locator('.notification-card')
        .filter({ hasText: 'Booking ' + bookingId + ' cancelled.' }),
    ).toBeVisible();

    await driver.goto('/?' + params);
    await check(spotCard(driver).getByText('Available for your times')).toBeVisible();
    const adminRoute = await admin.goto('/admin/payments');
    assert.equal(adminRoute?.status(), 200, 'The admin detail route could not be opened directly.');
    await check(admin.getByRole('heading', { name: 'Simulated payment records' })).toBeVisible();
    assert.deepEqual(browserErrors, [], 'The browser reported uncaught page errors.');
    console.log(
      'Hosted smoke passed: assets, health, secure role logins, map markers, uploads and slot release.',
    );
    console.log('Verified and cancelled hosted booking ' + bookingId + '.');
  } finally {
    if (driver && !cancelled) {
      try {
        await cancelIfNeeded(driver, bookingId, requestKey, origin);
      } catch {
        console.error(
          'Booking cleanup could not be verified' +
            (bookingId && uuid.test(bookingId) ? ' for ' + bookingId : '') +
            '.',
        );
      }
    }
    await browser.close();
  }
}

await run().catch((error) => {
  let message = error instanceof Error ? error.message : 'Unknown browser failure.';
  for (const password of Object.values(passwords)) {
    if (password) message = message.replaceAll(password, '[redacted]');
  }
  console.error(message);
  process.exitCode = 1;
});
