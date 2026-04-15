/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling native modules — let them load at runtime
  serverExternalPackages: ["@libsql/client", "better-sqlite3"],
};

module.exports = nextConfig;
