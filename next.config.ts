import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const deploymentId = process.env.NEXT_DEPLOYMENT_ID?.trim();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  output: "standalone",
  ...(deploymentId
    ? {
        deploymentId,
      }
    : {}),
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "@firecrawl/anydoc"],
  allowedDevOrigins: ["192.168.1.152", "100.98.140.47"],
  experimental: {
    proxyClientMaxBodySize: "30mb",
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withNextIntl(nextConfig);
