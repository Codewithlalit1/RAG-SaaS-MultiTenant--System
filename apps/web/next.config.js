/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const api = process.env.API_URL ?? 'http://localhost:3000';
    return [
      { source: '/auth/:path*', destination: `${api}/auth/:path*` },
      { source: '/api/:path*',  destination: `${api}/api/:path*`  },
    ];
  },
};

module.exports = nextConfig;
