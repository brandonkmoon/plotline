/** @type {import('next').NextConfig} */
const nextConfig = {};

// PWA: only enable in production builds
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  try {
    const withPWA = require("@ducanh2912/next-pwa").default({
      dest: "public",
      register: true,
      skipWaiting: true,
    });
    module.exports = withPWA(nextConfig);
  } catch {
    module.exports = nextConfig;
  }
} else {
  module.exports = nextConfig;
}
