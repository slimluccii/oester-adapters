import { relative } from "node:path";

/**
 * Splits the files the server outputs need into parts, so that each output loads only the parts holding its files:
 * files needed by the same set of outputs share a part. Parts are numbered in the order their first file appears.
 */
export function groupParts(outputs: { id: string; files: string[] }[]): {
  parts: string[][];
  partsOf: Record<string, number[]>;
} {
  const needers = new Map<string, Set<string>>();
  for (const { id, files } of outputs)
    for (const file of files) {
      const set = needers.get(file) ?? new Set();
      set.add(id);
      needers.set(file, set);
    }
  const partIndex = new Map<string, number>();
  const parts: string[][] = [];
  for (const [file, ids] of needers) {
    const key = [...ids].sort().join("\0");
    let index = partIndex.get(key);
    if (index === undefined) {
      index = parts.push([]) - 1;
      partIndex.set(key, index);
    }
    parts[index]!.push(file);
  }
  const partsOf: Record<string, number[]> = {};
  for (const { id, files } of outputs)
    partsOf[id] = [
      ...new Set(files.map((file) => partIndex.get([...needers.get(file)!].sort().join("\0"))!)),
    ].sort((a, b) => a - b);
  return { parts, partsOf };
}

/** The path a file has inside the server's virtual file system: its path from the repository root, under /app. */
export function virtualPath(absolute: string, repoRoot: string): string {
  const path = relative(repoRoot, absolute);
  if (path.startsWith(".."))
    throw new Error(`${absolute} is outside the repository root ${repoRoot}`);
  return path ? `/app/${path.split("\\").join("/")}` : "/app";
}
