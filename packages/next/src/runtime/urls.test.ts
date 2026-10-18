import { describe, expect, test } from "vitest";
import { onOrigin } from "./urls.ts";

describe("onOrigin", () => {
  test("a URL Next wrote with localhost for a loopback address moves back to the request's origin", () => {
    const origin = new URL("https://127.0.0.1:8787/a");
    expect(onOrigin(new URL("https://localhost:8787/b?c=1"), origin).href).toBe(
      "https://127.0.0.1:8787/b?c=1",
    );
    expect(onOrigin(new URL("https://localhost:8787/b"), new URL("https://[::1]:8787/")).href).toBe(
      "https://[::1]:8787/b",
    );
  });

  test("any other URL is left as it is", () => {
    const origin = new URL("https://example.com/");
    expect(onOrigin(new URL("https://localhost/b"), origin).href).toBe("https://localhost/b");
    expect(onOrigin(new URL("https://other.com/b"), origin).href).toBe("https://other.com/b");
    expect(onOrigin(new URL("https://localhost:1/b"), new URL("https://127.0.0.1:2/")).href).toBe(
      "https://localhost:1/b",
    );
  });
});
