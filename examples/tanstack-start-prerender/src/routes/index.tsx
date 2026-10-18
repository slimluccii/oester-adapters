import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: () => ({ renderedAt: new Date().toISOString() }),
  component: () => <h1>Docs home, rendered at {Route.useLoaderData().renderedAt}</h1>,
});
