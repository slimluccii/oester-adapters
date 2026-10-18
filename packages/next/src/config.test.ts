import { describe, expect, test } from "vitest";
import { oesterConfig, type ConfigSubset } from "./config.ts";

const base: ConfigSubset = {
  images: { loader: "default", unoptimized: false },
  experimental: {},
};

describe("oesterConfig", () => {
  test("the default image loader, which needs the image optimizer, serves images as they are", () => {
    const { config, warnings } = oesterConfig(base);
    expect(config.images).toEqual({ loader: "default", unoptimized: true });
    expect(warnings).toHaveLength(1);
  });

  test("a custom loader or an explicit unoptimized setting is kept as it is", () => {
    for (const images of [
      { loader: "custom", loaderFile: "./loader.js", unoptimized: false },
      { loader: "cloudinary", path: "https://res.cloudinary.com/x/", unoptimized: false },
      { loader: "default", unoptimized: true },
    ]) {
      const { config, warnings } = oesterConfig({ ...base, images });
      expect(config.images).toEqual(images);
      expect(warnings).toEqual([]);
    }
  });

  test("the incremental cache never writes to a file system", () => {
    expect(oesterConfig(base).config.experimental).toEqual({ isrFlushToDisk: false });
  });

  test("i18n routing fails the build, before anything is compiled", () => {
    expect(() =>
      oesterConfig({ ...base, i18n: { locales: ["en", "nl"], defaultLocale: "en" } }),
    ).toThrow(/i18n/);
    expect(() => oesterConfig({ ...base, i18n: null })).not.toThrow();
  });

  test("other settings pass through untouched", () => {
    const { config } = oesterConfig({ ...base, basePath: "/docs", trailingSlash: true });
    expect(config.basePath).toBe("/docs");
    expect(config.trailingSlash).toBe(true);
  });
});
