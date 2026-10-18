export default defineEventHandler((event) => {
  setResponseHeader(event, "x-server-middleware", "ran");
});
