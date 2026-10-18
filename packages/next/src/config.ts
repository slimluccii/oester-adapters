/** The part of Next's resolved config the adapter changes; the rest passes through. */
export type ConfigSubset = {
  images: { loader?: string; loaderFile?: string; unoptimized?: boolean; [key: string]: unknown };
  experimental: Record<string, unknown>;
  [key: string]: unknown;
};

/** Adjusts Next's config to what runs on Oester, with a warning for each behavior that changes. */
export function oesterConfig<T extends ConfigSubset>(config: T): { config: T; warnings: string[] } {
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
