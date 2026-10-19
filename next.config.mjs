/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Loaded from node_modules at run time instead of bundled; Chromium is a binary.
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    outputFileTracingIncludes: {
      "/api/evaluations/[employeeId]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
