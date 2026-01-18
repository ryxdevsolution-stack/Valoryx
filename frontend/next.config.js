/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Back to standalone for full Next.js features
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'habjhxjutlgnjwjbpkvl.supabase.co',
        pathname: '/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  poweredByHeader: false,
  compress: true,
}

module.exports = nextConfig
