/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['habjhxjutlgnjwjbpkvl.supabase.co'],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
}

module.exports = nextConfig
