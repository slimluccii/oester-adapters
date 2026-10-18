import { adapterPath } from "@oester/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  adapterPath,
  async redirects() {
    return [{ source: "/old/:slug", destination: "/blog/:slug", permanent: true }];
  },
  async rewrites() {
    return [{ source: "/rewritten", destination: "/dynamic" }];
  },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "x-config-header", value: "yes" }] }];
  },
};

export default config;
