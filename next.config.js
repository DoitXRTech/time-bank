/** @type {import('next').NextConfig} */
// Identifies this deploy: the commit Vercel built. It is inlined into the code of the browser and of the
// server, so a tab can tell it was loaded from an older deploy (see src/domain/appVersion.js).
const APP_BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || 'development';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_BUILD_ID: APP_BUILD_ID },
  // Everything the API answers is private and changes under people's feet: never keep it in a cache
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }];
  },
};

module.exports = nextConfig;
