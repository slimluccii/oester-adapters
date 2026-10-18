import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";

export async function load({ url, fetch }) {
  const robots = await fetch(resolve("/") + "robots.txt").then((r) => r.text());
  return { path: url.pathname, robots };
}

export const actions = {
  go: async () => {
    redirect(303, resolve("/guide"));
  },
};
