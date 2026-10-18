import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/profile")({
  component: () => <h1>Profile screen</h1>,
});
