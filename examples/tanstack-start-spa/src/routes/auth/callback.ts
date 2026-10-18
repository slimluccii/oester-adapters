import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const code = new URL(request.url).searchParams.get("code");
        return new Response(null, {
          status: 302,
          headers: { location: "/settings/profile", "set-cookie": `session=${code}; Path=/` },
        });
      },
    },
  },
});
