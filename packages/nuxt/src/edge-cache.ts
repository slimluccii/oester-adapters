type CacheRule = {
  cache?: false | { swr?: boolean; maxAge?: number; staleMaxAge?: number };
  isr?: boolean | number;
  headers?: Record<string, string>;
  [other: string]: unknown;
};

const year = 31536000;

/**
 * Turns a normalized Nitro route rule that caches (`swr`, `isr`, `cache`) into a cache-control for Oester's edge cache,
 * which every isolate shares and every deploy purges, in place of Nitro's cache in the memory of one isolate.
 */
export function edgeCacheRule(
  rule: CacheRule,
): { cache: false; headers: Record<string, string> } | undefined {
  let directives: string[] | undefined;
  if (rule.isr !== undefined && rule.isr !== false) {
    directives =
      rule.isr === true
        ? [`s-maxage=${year}`]
        : [`s-maxage=${rule.isr}`, `stale-while-revalidate=${year}`];
  } else if (rule.cache) {
    directives = [`s-maxage=${rule.cache.maxAge ?? 1}`];
    if (rule.cache.swr !== false)
      directives.push(
        `stale-while-revalidate=${rule.cache.staleMaxAge && rule.cache.staleMaxAge > 0 ? rule.cache.staleMaxAge : year}`,
      );
  }
  if (!directives) return undefined;
  const headers = { ...rule.headers };
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "cache-control"))
    headers["cache-control"] = ["public", "max-age=0", ...directives].join(", ");
  return { cache: false, headers };
}
