/** The part of Next's resolved config the adapter changes; the rest passes through. */
export type ConfigSubset = {
  images: { loader?: string; loaderFile?: string; unoptimized?: boolean; [key: string]: unknown };
  experimental: Record<string, unknown>;
  [key: string]: unknown;
};

/** Adjusts Next's config to what runs on Oester, with a warning for each behavior that changes. */
export function oesterConfig<T extends ConfigSubset>(config: T): { config: T; warnings: string[] } {
  // @next/routing 16.4 resolves / to /<defaultLocale>/, which the trailing slash redirect then catches, and never finds
  // dynamic API routes, whose patterns expect a locale it does not add for /api paths.
  if (config.i18n)
    throw new Error(
      "Oester does not run Next.js i18n routing yet: @next/routing, which resolves Next's routes on Oester, mis-resolves the root path and dynamic API routes under i18n. Remove i18n from next.config, or route locales with the App Router's [lang] segment.",
    );
  const warnings: string[] = [];
  let images = config.images;
  // The image optimizer needs sharp, a native module the edge cannot load.
  if ((images.loader ?? "default") === "default" && !images.loaderFile && !images.unoptimized) {
    images = { ...images, unoptimized: true };
    warnings.push(
      "next/image serves images as they are on Oester: the image optimizer needs sharp, which cannot run on the edge. Set images.loader or images.loaderFile to resize them elsewhere.",
    );
  }
  return {
    config: { ...config, images, experimental: { ...config.experimental, isrFlushToDisk: false } },
    warnings,
  };
}
