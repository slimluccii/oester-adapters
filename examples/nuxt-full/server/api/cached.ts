export default defineEventHandler((event) => {
  setResponseHeader(event, "cache-control", "public, s-maxage=30");
  return { cached: true };
});
