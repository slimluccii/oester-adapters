import { createFileRoute, notFound } from "@tanstack/react-router";

const posts: Record<string, string> = { first: "The first post" };

export const Route = createFileRoute("/posts/$id")({
  loader: ({ params }) => {
    const title = posts[params.id];
    if (!title) throw notFound();
    return title;
  },
  component: () => <h1>{Route.useLoaderData()}</h1>,
});
