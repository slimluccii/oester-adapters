import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { init, parse } from "es-module-lexer";
import { expect, test } from "vitest";
import { nodeBuiltins, type Manifest } from "../packages/build-output/src/contract.ts";

const output = process.env.OESTER_OUTPUT;
const manifest: Manifest | undefined = output
  ? JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"))
  : undefined;
const entry = manifest?.server?.entry;

test.skipIf(!output || !entry)(
  "0077: the server output is one module that imports only Node builtins",
  async () => {
    const files = readdirSync(join(output!, "server"), { recursive: true, withFileTypes: true })
      .filter((file) => file.isFile())
      .map((file) => join(file.parentPath, file.name).slice(output!.length + 1));
    expect(files).toEqual([entry]);

    await init;
    const [imports] = parse(readFileSync(join(output!, entry!), "utf8"));
    expect(imports.filter((i) => i.type === "dynamic").length, "import()").toBe(0);
    expect(imports.filter((i) => i.type === "import-meta").length, "import.meta").toBe(0);
    for (const { specifier } of imports) {
      expect(specifier).toMatch(/^node:/);
      expect(nodeBuiltins).toContain(specifier!.slice("node:".length));
    }
  },
);
