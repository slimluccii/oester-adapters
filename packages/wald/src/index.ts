import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import {
  outputDirectory,
  writeOutput,
  type HtmlHandling,
  type NotFound,
} from "@oester/build-output";
import type { WaldAdapter } from "@waldjs/cli";

export type OesterOptions = {
  /** Whether page URLs end in a slash: `always` and `never` redirect the other form with 308, `ignore` serves both. */
  trailingSlash?: "ignore" | "always" | "never";
};

const htmlHandling: Partial<Record<string, HtmlHandling>> = {
  always: "force-trailing-slash",
  never: "drop-trailing-slash",
};

/** The WaldJS adapter that writes the Oester build output to `.oester/output`. */
export function oester(options: OesterOptions = {}): WaldAdapter {
  return {
    name: "oester",
    async adapt({ rootDir, outDir, base }) {
      const output = join(rootDir, outputDirectory);
      const fromOutput = relative(output, outDir);
      if (!isAbsolute(fromOutput) && fromOutput.split(sep)[0] !== "..")
        throw new Error(
          `the WaldJS outDir ${outDir} is inside ${output}, which @oester/wald replaces on every build; use another outDir, such as the default dist`,
        );

      const version = await waldVersion(rootDir);
      const handling = options.trailingSlash && htmlHandling[options.trailingSlash];
      const notFound = notFoundPage(outDir);
      await writeOutput({
        root: rootDir,
        staticDir: outDir,
        framework: { name: "wald", ...(version ? { version } : {}) },
        base,
        routes: [{ match: "/*", type: "static" }],
        ...(handling ? { htmlHandling: handling } : {}),
        ...(notFound ? { notFound } : {}),
      });
    },
  };
}

// WaldJS has no not-found convention: src/pages/404.wald renders to 404/index.html, public/404.html is copied as it is.
function notFoundPage(outDir: string): NotFound | undefined {
  const file = ["404.html", "404/index.html"].find((name) => existsSync(join(outDir, name)));
  return file ? { type: "static", file } : undefined;
}

async function waldVersion(rootDir: string): Promise<string | undefined> {
  try {
    // @waldjs/cli exports no package.json, so its version is found next to the resolved entry.
    const entry = createRequire(join(rootDir, "package.json")).resolve("@waldjs/cli");
    for (let dir = dirname(entry); dir !== dirname(dir); dir = dirname(dir)) {
      const path = join(dir, "package.json");
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(await readFile(path, "utf8"));
      if (pkg.name === "@waldjs/cli") return pkg.version;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
