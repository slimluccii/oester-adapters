import { env } from "$env/dynamic/private";

export function load() {
  return { legacy: env.SECRET_MESSAGE };
}
