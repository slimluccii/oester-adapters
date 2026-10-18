import { state } from "#lib/server/state.ts";
import type { Handle, HandleFetch, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";

export const init: ServerInit = async () => {
  state.initialized = true;
};

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = crypto.randomUUID();
  if (event.url.pathname === "/custom") return new Response("answered by handle");
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%transformed%", "transformed by handle"),
  });
  response.headers.set("x-handled-by", "hooks.server");
  return response;
};

export const handleFetch: HandleFetch = async ({ request, fetch }) => {
  if (new URL(request.url).pathname === "/api/hello") request.headers.set("x-via", "handleFetch");
  return fetch(request);
};

export const handleError: HandleServerError = ({ kind, error }) => {
  if (kind === "unknown") {
    console.error(error);
    return { message: "Whoops", errorId: "E-1" };
  }
  return error as App.Error;
};
