const loopback = /^(127(\.\d{1,3}){3}|\[::1\]|localhost)$/;

/**
 * Next.js writes `localhost` for a loopback address in the URLs middleware builds from the request. Such a URL is on
 * the request's own origin, so routing must not treat a rewrite to it as external.
 */
export function onOrigin(target: URL, origin: URL): URL {
  if (
    target.hostname !== "localhost" ||
    !loopback.test(origin.hostname) ||
    target.port !== origin.port ||
    target.protocol !== origin.protocol
  )
    return target;
  return new URL(`${target.pathname}${target.search}${target.hash}`, origin);
}
