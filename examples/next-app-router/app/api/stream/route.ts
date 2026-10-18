export const dynamic = "force-dynamic";

export function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("first\n"));
      await new Promise((resolve) => setTimeout(resolve, 400));
      controller.enqueue(encoder.encode("second\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain" } });
}
