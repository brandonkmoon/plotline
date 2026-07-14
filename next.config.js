/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native modules out of the server bundle. Renamed from
  // experimental.serverComponentsExternalPackages (stable in Next 15+).
  serverExternalPackages: ["@libsql/client"],
};

module.exports = nextConfig;
