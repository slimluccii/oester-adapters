// Copied from slimluccii/oester ingest/content-types.ts at 9d3a23e; keep it in step with that file.
const byExtension: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml",
  rss: "application/rss+xml",
  atom: "application/atom+xml",
  webmanifest: "application/manifest+json",
  map: "application/json",
  wasm: "application/wasm",
  pdf: "application/pdf",
  zip: "application/zip",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  vtt: "text/vtt; charset=utf-8",
};

export function contentTypeOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return byExtension[extension] ?? "application/octet-stream";
}
