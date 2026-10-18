import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, setCookie } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/cookies")({
  server: {
    handlers: {
      GET: () => {
        setCookie("first", "1", { path: "/" });
        setCookie("second", "2", { path: "/", secure: true });
        deleteCookie("stale");
        return new Response("three cookies");
      },
    },
  },
});
