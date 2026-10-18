import { adapterPath } from "@oester/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  adapterPath,
  cacheComponents: true,
};

export default config;
