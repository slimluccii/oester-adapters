import { describe, expect, test } from "vitest";
import { NodeResponse, nodeRequest } from "./node-http.ts";

async function body(request: ReturnType<typeof nodeRequest>): Promise<string> {
  let text = "";
  for await (const chunk of request) text += Buffer.from(chunk as Uint8Array).toString();
  return text;
}

describe("nodeRequest", () => {
  test("carries the method, the path with its query, lowercased headers and the client address", () => {
    const request = nodeRequest(
      new Request("https://example.com/a/b?x=1", {
        headers: { "X-Thing": "1", cookie: "a=1" },
      }),
      { url: "/a/b?x=1", clientAddress: "1.2.3.4" },
    );
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/a/b?x=1");
    expect(request.headers["x-thing"]).toBe("1");
    expect(request.headers.cookie).toBe("a=1");
    expect(request.headers.host).toBe("example.com");
    expect(request.socket.remoteAddress).toBe("1.2.3.4");
    expect(request.socket.encrypted).toBe(true);
    expect(request.httpVersion).toBe("1.1");
  });

  test("streams the request body", async () => {
    const request = nodeRequest(
      new Request("https://example.com/", { method: "POST", body: "hello" }),
      { url: "/" },
    );
    expect(await body(request)).toBe("hello");
  });

  test("a request without a body ends at once", async () => {
    expect(await body(nodeRequest(new Request("https://example.com/"), { url: "/" }))).toBe("");
  });
});

describe("NodeResponse", () => {
  test("writes become the body of the Response, with status and headers", async () => {
    const response = new NodeResponse();
    response.statusCode = 201;
    response.setHeader("content-type", "text/plain");
    response.setHeader("set-cookie", ["a=1", "b=2"]);
    response.write("hel");
    response.end("lo");
    const result = await response.response;
    expect(result.status).toBe(201);
    expect(result.headers.get("content-type")).toBe("text/plain");
    expect(result.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(await result.text()).toBe("hello");
    expect(response.headersSent).toBe(true);
    expect(response.writableEnded).toBe(true);
  });

  test("writeHead sets the status and merges headers", async () => {
    const response = new NodeResponse();
    response.setHeader("x-a", "1");
    response.writeHead(404, { "x-b": "2" });
    response.end();
    const result = await response.response;
    expect(result.status).toBe(404);
    expect(result.headers.get("x-a")).toBe("1");
    expect(result.headers.get("x-b")).toBe("2");
    expect(await result.text()).toBe("");
  });

  test("the Response is available as soon as the headers are flushed, before the body ends", async () => {
    const response = new NodeResponse();
    response.flushHeaders();
    const result = await response.response;
    const reader = result.body!.getReader();
    response.write("first");
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    response.end();
    expect((await reader.read()).done).toBe(true);
  });

  test("header helpers behave like Node's", () => {
    const response = new NodeResponse();
    response.setHeader("X-A", "1");
    expect(response.getHeader("x-a")).toBe("1");
    expect(response.hasHeader("X-A")).toBe(true);
    expect(response.getHeaderNames()).toEqual(["x-a"]);
    response.appendHeader("x-a", "2");
    expect(response.getHeader("x-a")).toEqual(["1", "2"]);
    response.removeHeader("x-a");
    expect(response.getHeaders()).toEqual({});
  });

  test("a status 204 or 304 has no body, whatever was written", async () => {
    const response = new NodeResponse();
    response.statusCode = 304;
    response.end("ignored");
    const result = await response.response;
    expect(result.status).toBe(304);
    expect(result.body).toBeNull();
  });

  test("close is emitted once the body has ended", async () => {
    const response = new NodeResponse();
    const closed = new Promise((done) => response.on("close", done));
    response.end("x");
    await (await response.response).text();
    await closed;
  });
});
