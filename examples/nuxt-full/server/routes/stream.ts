export default defineEventHandler((event) => {
  setResponseHeader(event, "content-type", "text/plain");
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const part of ["one", "two", "three"]) {
        controller.enqueue(encoder.encode(`${part}\n`));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      controller.close();
    },
  });
});
