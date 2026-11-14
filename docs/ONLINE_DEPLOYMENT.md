# Deploy DriveShare on free tiers

Use the isolated `codex/online-deployment` worktree. Vercel Hobby serves the unchanged Vite frontend, Render Free runs Express, Neon Free stores PostgreSQL data, and Cloudinary Free stores uploaded parking images. Keep the existing localhost checkout and its database for the offline demo.

## Hosting limits

- Render Free shares 750 instance-hours per workspace each month. It sleeps after 15 minutes idle and usually takes about a minute to wake. Its filesystem is ephemeral. This Blueprint creates one free web service and runs guarded migrations at startup because free services have no pre-deploy command or shell. [Render Free](https://render.com/docs/free).
- Neon Free includes 1 GB of PostgreSQL storage and 100 compute-unit hours per project monthly, subject to account limits. Compute can suspend when idle. Claimable projects expire after 72 hours unless claimed, and claiming rotates their connection credentials. [Neon Free](https://neon.com/docs/introduction/plans) · [Claimable Neon](https://neon.com/claimable-neon).
- Cloudinary Free includes 25 monthly credits shared across storage, delivery and transformations. DriveShare retains its 5 MiB JPEG, PNG and WebP uploads and serves the original bytes at the same app URLs. Claimable clouds expire after 24 hours and limit delivery by source IP until claimed. [Cloudinary Free](https://cloudinary.com/pricing) · [Claimable Cloud](https://cloudinary.com/documentation/claimable_cloud_provisioning).
- Vercel Hobby supports this noncommercial college demo. Its external proxy timeout is 120 seconds. A cold Render start can delay the first request. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Proxy limits](https://vercel.com/docs/limits#proxied-request-timeout).

## Set up staging

1. In a Neon Free project, create a database named `driveshare_online`. Use the **direct** TLS connection string with connection pooling off. Use fresh credentials after claiming a temporary Neon project. Set the connection string as `DATABASE_URL` in the isolated deployment shell and in Render, and keep it out of Vercel and Git. [Neon Prisma guide](https://neon.com/docs/guides/prisma).
2. Run the hosted database guard and migrations from the isolated checkout with `NODE_ENV=production`, `DEMO_MODE=false` and `DATABASE_URL` set. For bootstrap, set a unique `SESSION_SECRET` and three separate passwords of 16–72 UTF-8 bytes as private process variables. The accounts are `driver@driveshare.demo`, `owner@driveshare.demo`, and `admin@driveshare.demo`. Bootstrap also creates the driver's car and Sahyadri parking fixtures. It preserves existing rows on repeat runs.

   ```sh
   node --import tsx apps/api/prisma/hosted-database.ts
   npm run db:migrate
   DRIVESHARE_BOOTSTRAP=true node --import tsx apps/api/prisma/bootstrap-hosted.ts
   ```

   The password variables are `DRIVESHARE_ONLINE_DRIVER_PASSWORD`, `DRIVESHARE_ONLINE_HOST_PASSWORD` and `DRIVESHARE_ONLINE_ADMIN_PASSWORD`. Run bootstrap from the isolated deployment shell because Render Free has no shell. Use private environment input for all credentials.

3. Sign in to Vercel and create a separate Hobby staging project. Record its public HTTPS frontend origin. In Render, apply the Blueprint from **codex/online-deployment**. Confirm it lists a single **Free** web service. Set `APP_ORIGIN` to the staging frontend origin without a trailing slash, provide the Neon `DATABASE_URL`, and supply `DRIVESHARE_CLOUDINARY_NAME`, `DRIVESHARE_CLOUDINARY_API_KEY`, and `DRIVESHARE_CLOUDINARY_API_SECRET` from the claimed Cloudinary Free environment. Render generates a separate session secret. Wait for the Render service to be Live and its `/api/health` to return `{"status":"ok"}`. [Render Blueprints](https://render.com/docs/infrastructure-as-code).
4. In the staging Vercel project, use the repository root and set `DRIVESHARE_API_ORIGIN` to the actual Render HTTPS origin. `vercel.mjs` builds `apps/web/dist`, proxies `/api` and `/uploads` to Render, and serves the SPA on valid client routes. This keeps Secure session cookies and CSRF checks on the frontend origin. [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
5. Run `npm ci` and `npx playwright install chromium` in the deployment checkout. Set `DRIVESHARE_STAGING_URL` to the staging origin and supply the three private demo passwords. Run `node scripts/smoke-hosted.mjs`. It tests the built frontend, direct refresh, database health, all three secure logins, mobile map markers, a 24-hour booking with the same driver and host ID, cancellation, refunded availability, and a real image upload. It leaves one cancelled reservation and a small test image.

## Publish to the existing Vercel project

After staging passes, deploy the verified commit to the existing `driveshare` Vercel project with the real `DRIVESHARE_API_ORIGIN` configured. For a CLI release, use `vercel deploy --prod --skip-domain` from the verified worktree. Inspect the new deployment, point Render's `APP_ORIGIN` at `https://driveshare-two.vercel.app`, then use `vercel promote <deployment-url>` to assign the original domain. Retain prior Vercel deployment history and the Git branches. Run the hosted smoke again with `DRIVESHARE_VERIFY_PRODUCTION=true` and `DRIVESHARE_STAGING_URL=https://driveshare-two.vercel.app` for the authorized production check. [Vercel deployment promotion](https://vercel.com/docs/deployments/promoting-a-deployment).

## Verification on 11 November 2026

Both original Prisma migrations ran against the isolated Singapore Neon database over direct TLS. SQL verified eight business tables, 49 validated constraints, `btree_gist`, the exclusion constraints, and the occupancy and payment indexes. Bootstrapping the hosted demo twice preserved the existing data. The production-mode browser rehearsal ran through a loopback HTTPS frontend and used real Neon and Cloudinary services. Driver, host and administrator login, booking ID matching, cancellation and slot release, map markers, and a byte-for-byte image upload passed. The regression suite passed **97 API and storage tests and 12 browser tests**. The dependency audit reported zero known vulnerabilities. The official Render schema accepted the Free Blueprint.

The original Vercel domain serves a 404 from its README-only deployment. Public staging and promotion require authenticated hosting access. Keep the hosted smoke results separate from the loopback rehearsal.
