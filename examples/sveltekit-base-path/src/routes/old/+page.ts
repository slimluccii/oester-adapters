import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";

export const prerender = true;

export function load() {
  redirect(301, resolve("/guide"));
}
