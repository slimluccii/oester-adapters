import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Workspace = { dir: string; name: string; dependencies: string[] };
export type Affected = { packages: string[]; examples: string[] };

const ignored = (file: string) => file.startsWith(".changeset/") || /^[^/]+\.md$/.test(file);

/** The packages and examples a set of changed files reaches through workspace dependencies; undefined means unknown. */
export function affected(changed: string[] | undefined, workspaces: Workspace[]): Affected {
  const pick = (selected: Workspace[]): Affected => ({
    packages: selected.filter((w) => w.dir.startsWith("packages/")).map((w) => w.dir),
    examples: selected
      .filter((w) => w.dir.startsWith("examples/"))
      .map((w) => w.dir.slice("examples/".length)),
  });
  const touched = new Set<Workspace>();
  for (const file of changed ?? [""]) {
    if (changed && ignored(file)) continue;
    const owner = workspaces.find((w) => file.startsWith(`${w.dir}/`));
    if (!owner) return pick(workspaces);
    if (owner.dir === "e2e")
      workspaces.filter((w) => w.dir.startsWith("examples/")).forEach((w) => touched.add(w));
    else touched.add(owner);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const w of workspaces)
      if (
        !touched.has(w) &&
        w.dependencies.some((name) => [...touched].some((t) => t.name === name))
      ) {
        touched.add(w);
        grew = true;
      }
  }
  return pick(workspaces.filter((w) => touched.has(w)));
}

function readWorkspaces(root: string): Workspace[] {
  const dirs = ["packages", "examples"].flatMap((group) =>
    readdirSync(join(root, group)).map((name) => `${group}/${name}`),
  );
  return [...dirs, "e2e"]
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
      const dependencies = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      });
      return { dir, name: manifest.name, dependencies };
    });
}

function changedSince(root: string, base: string | undefined): string[] | undefined {
  if (!base || /^0+$/.test(base)) return undefined;
  try {
    return execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return undefined;
  }
}

// Usage: node ci/affected.ts [base] prints the affected packages and examples as GitHub step outputs.
if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");
  const { packages, examples } = affected(
    changedSince(root, process.argv[2]),
    readWorkspaces(root),
  );
  const tested = examples.filter((name) =>
    existsSync(join(root, "examples", name, "oester.test.ts")),
  );
  console.log(`packages=${packages.join(" ")}\nexamples=${tested.join(" ")}`);
}
