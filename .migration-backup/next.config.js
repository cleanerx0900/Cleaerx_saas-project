/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["*.replit.dev", "*.pike.replit.dev", "*.riker.replit.dev", "*.sisko.replit.dev", "*.janeway.replit.dev", "*.kirk.replit.dev", "127.0.0.1"],

  // Next.js 16 uses Turbopack by default.
  // @react-pdf/renderer is used server-side (API routes) only.
  // An empty turbopack config silences the webpack-config warning while
  // preserving all default Turbopack behaviour for API routes.
  turbopack: {},
};

export default nextConfig;
