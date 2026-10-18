import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for (const part of ["one", "two", "three"]) {
        controller.enqueue(encoder.encode(`${part}\n`));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain" } });
};
