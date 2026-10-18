import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/$slug")({
  loader: ({ params }) => ({ slug: params.slug, renderedAt: new Date().toISOString() }),
  component: () => {
    const { slug, renderedAt } = Route.useLoaderData();
    return (
      <h1>
        Guide {slug}, rendered at {renderedAt}
      </h1>
    );
  },
});
