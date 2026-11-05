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
  webpack(config) {
    // The computer agent (src/agent/*.ps1) is imported as text and put into install.cmd.
    config.module.rules.push({ test: /\.ps1$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
