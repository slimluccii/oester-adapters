import { Await, createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/deferred")({
  loader: () => ({
    fast: "fast data",
    slow: new Promise<string>((resolve) => setTimeout(() => resolve("slow data"), 300)),
  }),
  component: Deferred,
});

function Deferred() {
  const { fast, slow } = Route.useLoaderData();
  return (
    <main>
      <p>{fast}</p>
      <Suspense fallback={<p>loading slow data</p>}>
        <Await promise={slow}>{(value) => <p>Resolved: {value}</p>}</Await>
      </Suspense>
    </main>
  );
}
