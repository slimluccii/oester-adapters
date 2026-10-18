import { adapterPath } from "@oester/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  adapterPath,
  basePath: "/docs",
  trailingSlash: true,
  async redirects() {
    return [{ source: "/old-about", destination: "/about/", permanent: true }];
  },
};

export default config;
