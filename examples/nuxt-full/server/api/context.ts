export default defineEventHandler((event) => ({
  hasWaitUntil: typeof event.context.waitUntil === "function",
  deployment: event.context.oester?.ctx.oester.deploymentId ?? null,
  plugin: event.context.plugin ?? null,
  ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
}));
