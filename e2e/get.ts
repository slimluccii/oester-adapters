const origin = process.env.OESTER_URL;

/** Requests a path of the example under test, from the local preview or a live deployment, without following redirects. */
export function get(path: string, init: RequestInit = {}): Promise<Response> {
  if (!origin) throw new Error("OESTER_URL is not set: run the checks through `pnpm e2e`");
  return fetch(new URL(path, origin), { redirect: "manual", ...init });
}

export const live = process.env.OESTER_LIVE === "1";

/** Oester's caching of static files: hashed assets for a year, everything else revalidated by its etag. */
export async function expectStaticCaching(page: string, asset: RegExp): Promise<void> {
  const { expect } = await import("vitest");
  const res = await get(page);
  const html = await res.text();
  const etag = res.headers.get("etag");
  expect(etag, `${page} has no etag`).toBeTruthy();
  expect(res.headers.get("cache-control") ?? "").not.toMatch(/immutable/);
  expect((await get(page, { headers: { "if-none-match": etag! } })).status).toBe(304);
  const path = html.match(asset)?.[0];
  expect(path, `${page} links no asset matching ${asset}`).toBeTruthy();
  expect((await get(path!)).headers.get("cache-control")).toBe(
    "public, max-age=31536000, immutable",
  );
}
