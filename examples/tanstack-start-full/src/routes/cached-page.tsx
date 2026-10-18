import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cached-page")({
  headers: () => ({ "cache-control": "public, max-age=30", "x-page": "cached" }),
  component: () => <h1>A page the CDN may keep</h1>,
});
