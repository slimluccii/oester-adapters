import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { transform } from "esbuild";
import type { FileContent } from "./runtime/modules.ts";

const textExtensions = new Set([
  ".json",
  ".txt",
  ".html",
  ".rsc",
  ".meta",
  ".css",
  ".body",
  ".xml",
  "",
]);
const scriptExtensions = new Set([".js", ".cjs", ".mjs"]);

/** Whether a file is machine code for a native addon, which the edge cannot load. */
export function isNativeCode(path: string): boolean {
  return /\.(node|dylib|dll|exe)$|\.so(\.\d+)*$/.test(path);
}

const packageTypes = new Map<string, Promise<string | undefined>>();

/** The `type` of the package a file belongs to, from the nearest package.json on disk. */
function packageType(directory: string): Promise<string | undefined> {
  let type = packageTypes.get(directory);
  if (!type) {
    type = readFile(join(directory, "package.json"), "utf8").then(
      (text) => (JSON.parse(text) as { type?: string }).type ?? "commonjs",
      () => (dirname(directory) === directory ? undefined : packageType(dirname(directory))),
    );
    packageTypes.set(directory, type);
  }
  return type;
}

/**
 * A traced file as the server's virtual file system holds it. Scripts become minified CommonJS whose import() calls are
 * require() calls, since the edge can neither import from a file system nor evaluate ES modules from a string. Source
 * maps and native addons are left out: nothing at runtime reads the first, and the edge cannot load the second.
 */
export async function serverFile(path: string, virtual: string): Promise<FileContent | undefined> {
  const extension = extname(path);
  if (extension === ".map" || isNativeCode(path) || path.endsWith(".d.ts")) return undefined;
  if (scriptExtensions.has(extension)) {
    const source = await readFile(path, "utf8");
    const esm =
      extension === ".mjs" ||
      (extension === ".js" && (await packageType(dirname(path))) === "module");
    const result = await transform(source, {
      loader: "js",
      format: esm ? "cjs" : undefined,
      platform: "node",
      target: "es2024",
      minifyWhitespace: true,
      minifySyntax: true,
      supported: { "dynamic-import": false },
      define: esm ? { "import.meta.url": JSON.stringify(`file://${virtual}`) } : undefined,
      sourcefile: virtual,
      logLevel: "silent",
    });
    return result.code;
  }
  const bytes = await readFile(path);
  if (textExtensions.has(extension)) return bytes.toString("utf8");
  return { base64: bytes.toString("base64") };
}

/** Every file below a directory, by absolute path. */
export async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

export async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );
}
