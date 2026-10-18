import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundleServer, type BundleOptions } from "./bundle.ts";
import {
  compatibilityDate,
  isPattern,
  isRefusedHeader,
  redirectStatuses,
  type Manifest,
} from "./contract.ts";

export const outputDirectory = ".oester/output";

export type OutputOptions = Omit<Manifest, "version" | "compatibilityDate" | "server"> & {
  /** The project's root; the output goes to `.oester/output` inside it. */
  root: string;
  /** The directory whose files are served as they are. */
  staticDir: string;
  /** The server entry to bundle, when any route, the middleware or the not-found response needs the server. */
  server?: Omit<BundleOptions, "outDir">;
};

/** Writes the whole build output, replacing what an earlier build left, and returns the manifest it wrote. */
export async function writeOutput(
  options: OutputOptions,
): Promise<{ manifest: Manifest; warnings: string[] }> {
  const { root, staticDir, server, framework, base, redirects, headers, ...rest } = options;
  const normalizedBase =
    base === undefined || base.replace(/^\/+|\/+$/g, "") === ""
      ? undefined
      : `/${base.replace(/^\/+|\/+$/g, "")}/`;
  const manifest: Manifest = {
    version: 3,
    framework,
    compatibilityDate,
    ...(normalizedBase ? { base: normalizedBase } : {}),
    ...rest,
    ...(redirects?.length ? { redirects } : {}),
    ...(headers?.length ? { headers } : {}),
    ...(server ? { server: { entry: "server/index.mjs" } } : {}),
  };
  check(manifest);

  const outputDir = join(root, outputDirectory);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(staticDir, join(outputDir, "static"), { recursive: true });
  const warnings = server
    ? (await bundleServer({ ...server, outDir: join(outputDir, "server") })).warnings
    : [];
  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, warnings };
}

function check(manifest: Manifest): void {
  const patterns = [
    ...manifest.routes.map((r) => r.match),
    ...(manifest.middleware
      ? [...manifest.middleware.include, ...(manifest.middleware.exclude ?? [])]
      : []),
    ...(manifest.redirects ?? []).map((r) => r.source),
    ...(manifest.headers ?? []).map((h) => h.source),
  ];
  for (const pattern of patterns)
    if (!isPattern(pattern))
      throw new Error(
        `${pattern} is not an Oester pattern: use literal segments, :name, and * only at the end`,
      );
  for (const redirect of manifest.redirects ?? [])
    if (!redirectStatuses.has(redirect.status))
      throw new Error(
        `the redirect from ${redirect.source} has status ${redirect.status}; Oester redirects with 301, 302, 307 or 308`,
      );
  for (const rule of manifest.headers ?? []) {
    for (const name of Object.keys(rule.headers))
      if (isRefusedHeader(name))
        throw new Error(`Oester refuses the header ${name} on ${rule.source}`);
  }
  const needsServer =
    manifest.routes.some((r) => r.type !== "static") ||
    manifest.middleware !== undefined ||
    manifest.notFound?.type === "server";
  if (needsServer && !manifest.server)
    throw new Error(
      "a route, the middleware or the not-found response needs the server, but there is no server entry",
    );
}
