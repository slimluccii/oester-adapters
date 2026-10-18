import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/boom")({
  loader: () => {
    throw new Error("the loader failed");
  },
  component: () => <p>unreachable</p>,
});
