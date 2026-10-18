import type { CacheProviderFactory } from "astro";

const provider: CacheProviderFactory = () => ({
  name: "oester",
  setHeaders(options) {
    const headers = new Headers();
    if (options.maxAge !== undefined) {
      const directives = ["public", "max-age=0", `s-maxage=${options.maxAge}`];
      if (options.swr !== undefined) directives.push(`stale-while-revalidate=${options.swr}`);
      headers.set("cache-control", directives.join(", "));
    }
    if (options.lastModified) headers.set("last-modified", options.lastModified.toUTCString());
    if (options.etag) headers.set("etag", options.etag);
    return headers;
  },
  invalidate() {
    return Promise.reject(
      new Error(
        "Oester purges every cached server response on every deploy; purging by path or tag is not available",
      ),
    );
  },
});

export default provider;
