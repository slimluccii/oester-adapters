import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getVersion = createServerFn({ method: "GET" }).handler(
  () => `api version ${process.env.API_VERSION}`,
);

export const Route = createFileRoute("/")({
  loader: () => getVersion(),
  component: () => <h1>Home screen, {Route.useLoaderData()}</h1>,
});
