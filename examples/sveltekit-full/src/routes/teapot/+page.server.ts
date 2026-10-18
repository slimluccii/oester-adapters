import { error } from "@sveltejs/kit";

export function load() {
  error(418, "I'm a teapot");
}
