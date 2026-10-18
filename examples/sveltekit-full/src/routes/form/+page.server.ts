import { fail, redirect } from "@sveltejs/kit";

export function load({ cookies }) {
  return { name: cookies.get("name") ?? null };
}

export const actions = {
  greet: async ({ request, cookies }) => {
    const name = String((await request.formData()).get("name") ?? "");
    if (!name) return fail(400, { missing: true });
    cookies.set("name", name, { path: "/" });
    return { greeting: `Hello, ${name}` };
  },
  leave: async () => {
    redirect(303, "/ssr");
  },
};
