/**
 * Where a static output of Next.js goes in the build output's `static/`, relative to it: an HTML page where Oester's
 * htmlHandling looks for its path, anything else at its path. Null for a path outside the base path.
 */
export function staticTarget(
  pathname: string,
  filePath: string,
  basePath: string,
  trailingSlash: boolean,
): string | null {
  if (basePath) {
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return null;
    pathname = pathname.slice(basePath.length) || "/";
  }
  const last = pathname.split("/").pop()!;
  if (filePath.endsWith(".html") && !last.includes(".")) {
    if (pathname === "/") return "index.html";
    return trailingSlash ? `${pathname.slice(1)}/index.html` : `${pathname.slice(1)}.html`;
  }
  return pathname.slice(1);
}
