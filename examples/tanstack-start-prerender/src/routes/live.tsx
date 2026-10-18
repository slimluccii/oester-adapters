import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getRegion = createServerFn({ method: "GET" }).handler(() => process.env.REGION ?? "unknown");

export const Route = createFileRoute("/live")({
  loader: () => getRegion(),
  component: () => <h1>Live from {Route.useLoaderData()}</h1>,
});
