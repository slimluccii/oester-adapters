import { describe, expect, test } from "vitest";
import { affected, type Workspace } from "./affected.ts";

const workspaces: Workspace[] = [
  { dir: "packages/build-output", name: "@oester/build-output", dependencies: [] },
  { dir: "packages/astro", name: "@oester/astro", dependencies: ["@oester/build-output"] },
  { dir: "packages/nuxt", name: "@oester/nuxt", dependencies: ["@oester/build-output"] },
  { dir: "examples/astro-server", name: "astro-server", dependencies: ["@oester/astro"] },
  { dir: "examples/astro-static", name: "astro-static", dependencies: ["@oester/astro"] },
  { dir: "examples/nuxt-full", name: "@example/nuxt", dependencies: ["@oester/nuxt"] },
  { dir: "e2e", name: "e2e", dependencies: [] },
];
const everything = {
  packages: ["packages/build-output", "packages/astro", "packages/nuxt"],
  examples: ["astro-server", "astro-static", "nuxt-full"],
};

describe("affected", () => {
  test("a change in one adapter affects that adapter and its examples only", () => {
    expect(affected(["packages/astro/src/index.ts"], workspaces)).toEqual({
      packages: ["packages/astro"],
      examples: ["astro-server", "astro-static"],
    });
  });

  test("a change in build-output affects every adapter that depends on it", () => {
    expect(affected(["packages/build-output/src/bundle.ts"], workspaces)).toEqual(everything);
  });

  test("examples are named by their folder, which the e2e runner takes, not by their package name", () => {
    expect(affected(["packages/nuxt/src/preset.ts"], workspaces).examples).toEqual(["nuxt-full"]);
  });

  test("a change in one example affects that example only", () => {
    expect(affected(["examples/nuxt-full/app/app.vue"], workspaces)).toEqual({
      packages: [],
      examples: ["nuxt-full"],
    });
  });

  test("a change in the e2e harness runs every example", () => {
    expect(affected(["e2e/get.ts"], workspaces)).toEqual({
      packages: [],
      examples: everything.examples,
    });
  });

  test("an unknown base, or a change outside the workspaces such as the lockfile, affects everything", () => {
    expect(affected(undefined, workspaces)).toEqual(everything);
    expect(affected(["pnpm-lock.yaml"], workspaces)).toEqual(everything);
    expect(affected([".github/workflows/release.yml"], workspaces)).toEqual(everything);
  });

  test("changesets and Markdown at the root affect nothing", () => {
    expect(affected([".changeset/brave-fox.md", "README.md"], workspaces)).toEqual({
      packages: [],
      examples: [],
    });
  });
});
