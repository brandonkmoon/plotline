/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep native modules out of the webpack bundle
    serverComponentsExternalPackages: ["@libsql/client", "better-sqlite3"],
  },
};

module.exports = nextConfig;
