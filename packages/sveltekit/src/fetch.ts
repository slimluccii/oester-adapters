import { AsyncLocalStorage } from "node:async_hooks";

type Assets = { fetch(input: string | Request): Promise<Response> };

const current = new AsyncLocalStorage<{ origin: string; assets: Assets }>();

export function withAssets<T>(scope: { origin: string; assets: Assets }, fn: () => T): T {
  return current.run(scope, fn);
}

/**
 * Stands in for the global `fetch` in the server bundle. SvelteKit fetches static files and prerendered pages over
 * HTTP from its own origin, which `env.ASSETS` answers without leaving the edge.
 */
export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const scope = current.getStore();
  if (scope) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === scope.origin && (request.method === "GET" || request.method === "HEAD")) {
      const response = await scope.assets.fetch(url.pathname);
      if (response.ok) return response;
    }
    return globalThis.fetch(request);
  }
  return globalThis.fetch(input, init);
}
