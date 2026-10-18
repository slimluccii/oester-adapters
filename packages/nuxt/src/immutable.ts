type PublicAsset = { baseURL?: string; maxAge?: number; dir: string };

const year = 31536000;

/** Nitro caches a public asset directory for a year only when its files are hashed builds, such as Nuxt's `/_nuxt/`. */
export function immutablePatterns(assets: PublicAsset[]): string[] {
  return assets
    .filter((asset) => (asset.maxAge ?? 0) >= year && asset.baseURL)
    .map((asset) => `/${asset.baseURL!.replace(/^\/+|\/+$/g, "")}/*`);
}
