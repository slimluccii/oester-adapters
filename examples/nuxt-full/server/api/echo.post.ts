export default defineEventHandler(async (event) => ({
  body: await readBody(event),
  method: event.method,
}));
