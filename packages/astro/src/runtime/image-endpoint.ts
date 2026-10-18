import type { APIRoute } from "astro";
import { imageConfig as configured } from "astro:assets";
import { fetchWithRedirects, getConfiguredImageService } from "astro/assets";
import { isRemotePath } from "@astrojs/internal-helpers/path";
import { isRemoteAllowed } from "@astrojs/internal-helpers/remote";
import type { OesterLocals } from "./handler.ts";

// Astro's generic endpoint fetches a local image from its own origin; on Oester that file is one env.ASSETS lookup away.
export const GET: APIRoute = async ({ request, locals, logger }) => {
  const service = await getConfiguredImageService();
  const imageConfig = configured as unknown as Parameters<typeof isRemoteAllowed>[1] &
    Parameters<NonNullable<typeof service.getURL>>[1];
  if (!("transform" in service))
    return new Response("The image service is not a local service", { status: 500 });
  const url = new URL(request.url);
  const transform = await service.parseURL(url, imageConfig, logger);
  if (!transform?.src) return new Response("Not Found", { status: 404 });

  const remote = isRemotePath(transform.src);
  if (remote && !isRemoteAllowed(transform.src, imageConfig))
    return new Response("Forbidden", { status: 403 });
  const source = new URL(transform.src, url.origin);
  if (!remote && source.origin !== url.origin) return new Response("Forbidden", { status: 403 });
  const { oester } = locals as { oester: OesterLocals };
  const response = remote
    ? await fetchWithRedirects({ url: source, headers: new Headers(), imageConfig })
    : await oester.env.ASSETS.fetch(source.pathname);
  if (!response.ok || (remote && !isRemoteAllowed(response.url, imageConfig)))
    return new Response("Not Found", { status: 404 });

  const { data, format } = await service.transform(
    new Uint8Array(await response.arrayBuffer()),
    transform,
    imageConfig,
    logger,
  );
  return new Response(data as BodyInit, {
    headers: {
      "content-type": `image/${format === "svg" ? "svg+xml" : format}`,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
