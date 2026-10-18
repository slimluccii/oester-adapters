import type { APIRoute } from "astro";

export const GET: APIRoute = () => Response.json({ hello: "world" });
