import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://api:3000',
  },
};

export default nextConfig;
