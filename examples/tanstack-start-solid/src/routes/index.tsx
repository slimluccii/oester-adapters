import { createFileRoute } from "@tanstack/solid-router";
import { createServerFn } from "@tanstack/solid-start";

const getFlavor = createServerFn({ method: "GET" }).handler(() => process.env.FLAVOR ?? "none");

export const Route = createFileRoute("/")({
  loader: () => getFlavor(),
  component: () => {
    const flavor = Route.useLoaderData();
    return <h1>Flavor: {flavor()}</h1>;
  },
});
