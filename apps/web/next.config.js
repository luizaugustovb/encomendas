/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
      {
        source: '/totem-api/:path*',
        destination: `${apiUrl}/api/totem/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
