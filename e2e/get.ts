const origin = process.env.OESTER_URL;

/** Requests a path of the example under test, from the local preview or a live deployment, without following redirects. */
export function get(path: string, init: RequestInit = {}): Promise<Response> {
  if (!origin) throw new Error("OESTER_URL is not set: run the checks through `pnpm e2e`");
  return fetch(new URL(path, origin), { redirect: "manual", ...init });
}

export const live = process.env.OESTER_LIVE === "1";
