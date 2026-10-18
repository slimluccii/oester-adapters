import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/redirect-me")({
  beforeLoad: () => {
    throw redirect({ to: "/deferred" });
  },
});
