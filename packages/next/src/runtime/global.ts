import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { clearImmediate, setImmediate } from "node:timers";

// Functions that throw when called with another `this` in some runtimes, so the deployment's global binds them.
const boundFunctions = [
  "fetch",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  "reportError",
] as const;

const emitterMethods = [
  "on",
  "once",
  "off",
  "addListener",
  "removeListener",
  "removeAllListeners",
  "prependListener",
  "prependOnceListener",
  "emit",
  "listeners",
  "rawListeners",
  "listenerCount",
  "setMaxListeners",
  "getMaxListeners",
  "eventNames",
] as const;

/**
 * An object that reads like the isolate's global object and keeps what is written to it. Functions and accessors that
 * check their `this` are bound to the real global; writes are definitions, so they never reach a setter there.
 */
export function isolatedGlobal(): {
  sandbox: Record<PropertyKey, unknown>;
  define(name: PropertyKey, value: unknown): void;
} {
  const sandbox: Record<PropertyKey, unknown> = Object.create(globalThis);
  const define = (name: PropertyKey, value: unknown) =>
    void Object.defineProperty(sandbox, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  for (const name of Reflect.ownKeys(globalThis)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)!;
    if (!descriptor.get) continue;
    Object.defineProperty(sandbox, name, {
      get: () => descriptor.get!.call(globalThis),
      set: (value: unknown) => define(name, value),
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
    });
  }
  for (const name of boundFunctions) {
    const value = (globalThis as Record<string, unknown>)[name];
    if (typeof value === "function") define(name, value.bind(globalThis));
  }
  return { sandbox, define };
}

type BaseProcess = { env: Record<string, string | undefined>; cwd(): string };

/**
 * A global object of the deployment's own, for the modules of Next's Node.js runtime. It falls back to the isolate's
 * global, which other deployments share, so what Next writes there at load and per request (its manifests, its
 * incremental cache, a patched fetch, Date, Math.random, crypto and console, process listeners) stays with this
 * deployment. What Next changes on intrinsics themselves, such as Error.prepareStackTrace, still reaches the isolate.
 *
 * `values` are the free variables each module gets, read when the module is evaluated.
 */
export function deploymentGlobal(base: BaseProcess): {
  values: Record<string, unknown>;
  process: BaseProcess;
} {
  const { sandbox, define } = isolatedGlobal();
  define("Math", Object.create(Math));
  // Web Crypto's methods insist on the real crypto object as this, so the deployment's crypto binds them.
  const crypto = Object.create(globalThis.crypto);
  for (const method of ["getRandomValues", "randomUUID"] as const)
    crypto[method] = globalThis.crypto[method].bind(globalThis.crypto);
  Object.defineProperty(crypto, "subtle", { get: () => globalThis.crypto.subtle });
  define("crypto", crypto);
  define("console", Object.create(console));
  define("Buffer", Buffer);
  define("setImmediate", setImmediate);
  define("clearImmediate", clearImmediate);
  define("global", sandbox);
  define("globalThis", sandbox);

  const emitter = new EventEmitter();
  const process: BaseProcess = Object.create(base);
  for (const method of emitterMethods)
    Object.defineProperty(process, method, {
      value: (...args: unknown[]) => {
        const result = (emitter[method] as (...a: unknown[]) => unknown)(...args);
        return result === emitter ? process : result;
      },
      writable: true,
      configurable: true,
    });
  define("process", process);

  const values: Record<string, unknown> = {};
  for (const name of [
    "Math",
    "crypto",
    "console",
    "Date",
    "Buffer",
    "setImmediate",
    "clearImmediate",
  ])
    Object.defineProperty(values, name, { get: () => sandbox[name], enumerable: true });
  Object.assign(values, {
    globalThis: sandbox,
    global: sandbox,
    // A wrapper rather than the function, so code calling fetch by name sees what Next patches in later.
    fetch: (...args: Parameters<typeof fetch>) => (sandbox.fetch as typeof fetch)(...args),
  });
  return { values, process };
}
