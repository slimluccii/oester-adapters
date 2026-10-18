import { describe, expect, test } from "vitest";
import { groupParts, virtualPath } from "./parts.ts";

describe("groupParts", () => {
  test("files every route needs form one part, files of one route another", () => {
    const { parts, partsOf } = groupParts([
      { id: "/a", files: ["/app/runtime.js", "/app/a.js"] },
      { id: "/b", files: ["/app/b.js", "/app/runtime.js"] },
    ]);
    expect(parts).toEqual([["/app/runtime.js"], ["/app/a.js"], ["/app/b.js"]]);
    expect(partsOf).toEqual({ "/a": [0, 1], "/b": [0, 2] });
  });

  test("files shared by some routes get a part of their own, and a route listing a file twice is fine", () => {
    const { parts, partsOf } = groupParts([
      { id: "x", files: ["/s", "/xy", "/xy"] },
      { id: "y", files: ["/s", "/xy", "/yz"] },
      { id: "z", files: ["/s", "/yz"] },
    ]);
    expect(parts).toEqual([["/s"], ["/xy"], ["/yz"]]);
    expect(partsOf).toEqual({ x: [0, 1], y: [0, 1, 2], z: [0, 2] });
  });
});

describe("virtualPath", () => {
  test("a file is addressed by its path from the repository root, under /app", () => {
    expect(virtualPath("/repo/apps/web/.next/server/a.js", "/repo")).toBe(
      "/app/apps/web/.next/server/a.js",
    );
    expect(virtualPath("/repo", "/repo")).toBe("/app");
  });

  test("a file outside the repository root is refused", () => {
    expect(() => virtualPath("/elsewhere/a.js", "/repo")).toThrow(/outside/);
  });
});
