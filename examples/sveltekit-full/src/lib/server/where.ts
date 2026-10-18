import { getRequestEvent } from "$app/server";

export async function currentPath(): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return getRequestEvent().url.pathname;
}
