/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    agentUpgrade: 'security',
  },
  async rewrites() {
    return [
      {
        source: '/:path((?!api|_next|static|favicon.ico|.*\\..*).*)',
        destination: '/',
      },
    ];
  },
};

export default nextConfig;
