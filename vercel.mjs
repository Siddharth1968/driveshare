const upstream = new URL(
  process.env.DRIVESHARE_API_ORIGIN ?? 'https://driveshare-staging-api.onrender.com',
);

if (
  upstream.protocol !== 'https:' ||
  !upstream.hostname.endsWith('.onrender.com') ||
  upstream.username ||
  upstream.password ||
  upstream.port ||
  upstream.pathname !== '/' ||
  upstream.search ||
  upstream.hash
) {
  throw new Error(
    'Set DRIVESHARE_API_ORIGIN to the HTTPS origin of the DriveShare Render service.',
  );
}

export const config = {
  framework: 'vite',
  installCommand: 'npm ci --include=dev',
  buildCommand: 'npm run build -w apps/web',
  outputDirectory: 'apps/web/dist',
  rewrites: [
    {
      source: '/api/:path*',
      destination: 'https://driveshare-staging-api.onrender.com/api/:path*',
    },
    {
      source: '/uploads/:path*',
      destination: 'https://driveshare-staging-api.onrender.com/uploads/:path*',
    },
    {
      source: '/((?!api(?:/|$)|uploads(?:/|$)|assets(?:/|$)|demo(?:/|$)|.*\\.[^/]+$).*)',
      destination: '/index.html',
    },
  ],
};
