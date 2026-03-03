/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:3001/uploads/:path*',
      },
      {
        source: '/totem-api/:path*',
        destination: 'http://localhost:3001/api/totem/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
