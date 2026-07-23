/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '.prisma/client'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // BYOK's request-context imports node:async_hooks (server-only). Client
      // component graphs may transitively import it (page → atlas.ts → here) but
      // never call it — alias it to an empty module for the browser bundle.
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'node:async_hooks': false,
      };
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        async_hooks: false,
        'node:async_hooks': false,
      };
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'static.atlascloud.ai' },
      { protocol: 'https', hostname: '**.atlascloud.ai' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
  },
};

export default nextConfig;
