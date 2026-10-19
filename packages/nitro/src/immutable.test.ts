import { expect, test } from "vitest";
import { immutablePatterns } from "./immutable.ts";

test("public assets Nitro caches for a year are hashed builds, so they never change under their name", () => {
  expect(
    immutablePatterns([
      { baseURL: "/_nuxt/", maxAge: 31536000, dir: "/x/.nuxt/dist/client/_nuxt" },
      { baseURL: "/", maxAge: 0, dir: "/x/public" },
      { dir: "/x/other" },
      { baseURL: "fonts", maxAge: 31536000, dir: "/x/fonts" },
    ]),
  ).toEqual(["/_nuxt/*", "/fonts/*"]);
});
