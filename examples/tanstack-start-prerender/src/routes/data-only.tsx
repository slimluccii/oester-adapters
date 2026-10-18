import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data-only")({
  ssr: "data-only",
  loader: () => ({ answer: 42 }),
  component: () => <h1>The answer is {Route.useLoaderData().answer}</h1>,
  pendingComponent: () => <p>Data-only page loading</p>,
});
