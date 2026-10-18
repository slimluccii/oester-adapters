import { redirect } from "@sveltejs/kit";
import { command, form, getRequestEvent, prerender, query } from "$app/server";

export const getGreeting = query(async () => {
  const { cookies } = getRequestEvent();
  return `hello, ${cookies.get("name") ?? "stranger"}`;
});

export const double = query("unchecked", async (n: number) => n * 2);

export const ticks = query.live(async function* () {
  for (let tick = 1; tick <= 3; tick++) {
    yield tick;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

export const increment = command("unchecked", async (n: number) => n + 1);

export const setName = form("unchecked", async (data: { name: string }) => {
  getRequestEvent().cookies.set("name", data.name, { path: "/" });
  redirect(303, "/");
});

export const buildInfo = prerender(async () => "computed at build time");
