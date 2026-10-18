import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

// Usage: pnpm e2e [example ...] builds each example and runs its oester.test.ts against the build served through Oester's
// own ingest and loader (the preview task of the oester repository, found at OESTER_REPO or ../oester).
// pnpm e2e --live <example>=<url> ... runs the same checks against deployments on Oester instead, without building.

const root = resolve(import.meta.dirname, "..");
const examplesDir = join(root, "examples");
const oester = resolve(process.env.OESTER_REPO ?? join(root, "../oester"));

const args = process.argv.slice(2);
const liveIndex = args.indexOf("--live");
const live =
  liveIndex >= 0
    ? Object.fromEntries(args.slice(liveIndex + 1).map((pair) => pair.split(/=(.*)/s).slice(0, 2)))
    : undefined;
const names = live
  ? Object.keys(live)
  : args.length
    ? args
    : readdirSync(examplesDir).filter((name) =>
        existsSync(join(examplesDir, name, "oester.test.ts")),
      );

type Example = { variables?: Record<string, string> };
const configOf = (name: string): Example =>
  JSON.parse(readFileSync(join(examplesDir, name, "package.json"), "utf8")).oester ?? {};

function freePort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

async function preview(name: string): Promise<{ url: string; stop: () => void }> {
  const port = await freePort();
  const variables = Object.entries(configOf(name).variables ?? {}).map(
    ([key, value]) => `${key}=${value}`,
  );
  const child: ChildProcess = spawn(
    "deno",
    [
      "task",
      "--quiet",
      "preview",
      join(examplesDir, name, ".oester/output"),
      String(port),
      ...variables,
    ],
    { cwd: oester, stdio: ["ignore", "inherit", "inherit"] },
  );
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`the preview of ${name} exited with ${child.exitCode}`);
    if (
      await fetch(url, { redirect: "manual" }).then(
        () => true,
        () => false,
      )
    )
      return { url, stop: () => child.kill() };
    await new Promise((wait) => setTimeout(wait, 200));
  }
  child.kill();
  throw new Error(`the preview of ${name} did not start`);
}

const failed: string[] = [];
for (const name of names) {
  console.log(`\n== ${name}`);
  let url = live?.[name];
  let stop = () => {};
  if (!url) {
    const built = spawnSync("pnpm", ["run", "build"], {
      cwd: join(examplesDir, name),
      stdio: "inherit",
    });
    if (built.status !== 0) {
      failed.push(`${name} (build)`);
      continue;
    }
    ({ url, stop } = await preview(name));
  }
  const tested = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", `../examples/${name}/oester.test.ts`],
    {
      cwd: import.meta.dirname,
      stdio: "inherit",
      env: { ...process.env, OESTER_URL: url, ...(live ? { OESTER_LIVE: "1" } : {}) },
    },
  );
  stop();
  if (tested.status !== 0) failed.push(name);
}

if (failed.length) {
  console.error(`\nFailed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nPassed: ${names.join(", ")}`);
