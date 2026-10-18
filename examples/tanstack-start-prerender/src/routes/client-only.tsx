import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-only")({
  ssr: false,
  loader: () => ({ where: typeof window === "undefined" ? "server" : "browser" }),
  component: () => <h1>Loaded in the {Route.useLoaderData().where}</h1>,
  pendingComponent: () => <p>Client-only page loading</p>,
});
