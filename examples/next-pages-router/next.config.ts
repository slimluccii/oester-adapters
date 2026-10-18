import { adapterPath } from "@oester/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  adapterPath,
  async redirects() {
    return [{ source: "/legacy", destination: "/about", permanent: false }];
  },
};

export default config;
