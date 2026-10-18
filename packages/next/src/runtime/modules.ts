import { posix } from "node:path";

// A CommonJS module system over an in-memory, read-only file system: the files Next.js traced for its server outputs,
// evaluated on demand. The Oester edge has neither a file system nor require(), and Next's Node.js outputs need both.

/** A file's content: text as a string, anything else base64-encoded. */
export type FileContent = string | { base64: string };

type Module = {
  id: string;
  filename: string;
  exports: unknown;
  loaded: boolean;
  children: Module[];
};
type Require = ((id: string) => unknown) & {
  resolve: (id: string) => string;
  cache: Record<string, Module>;
};

export type ModulesOptions = {
  /** Symbolic links by path, with their target paths. */
  links: Readonly<Record<string, string>>;
  /** The Node builtins the edge provides, by `node:` specifier. */
  builtins: Readonly<Record<string, object>>;
  /** The process modules see; `cwd()` is where relative paths start. */
  process: { cwd(): string; env: Record<string, string | undefined> };
  /** Values Node defines globally and the edge may not, handed to each module as a free variable. */
  globals?: { Buffer?: unknown; setImmediate?: unknown; clearImmediate?: unknown };
  /** The modification time every file reports: when it was built. */
  mtime?: Date;
};

const unavailable = new Set([
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "dns/promises",
  "domain",
  "http",
  "http2",
  "https",
  "inspector",
  "inspector/promises",
  "net",
  "os",
  "readline",
  "repl",
  "sqlite",
  "tls",
  "trace_events",
  "tty",
  "v8",
  "wasi",
  "worker_threads",
]);

const moduleParameters = [
  "exports",
  "require",
  "module",
  "__filename",
  "__dirname",
  "process",
  "global",
  "Buffer",
  "setImmediate",
  "clearImmediate",
];

function fsError(code: string, syscall: string, path: string): Error {
  const messages: Record<string, string> = {
    ENOENT: "no such file or directory",
    EROFS: "read-only file system",
    ENOTDIR: "not a directory",
    EISDIR: "illegal operation on a directory",
  };
  return Object.assign(new Error(`${code}: ${messages[code]}, ${syscall} '${path}'`), {
    code,
    errno: -1,
    syscall,
    path,
  });
}

function notFound(id: string, from: string): Error {
  return Object.assign(new Error(`Cannot find module '${id}' from '${from}'`), {
    code: "MODULE_NOT_FOUND",
  });
}

/** A module standing in for a Node builtin the edge lacks: it loads, and fails only when something uses it. */
function unavailableBuiltin(name: string): object {
  const fail = () => {
    throw new Error(`node:${name} is not available on Oester's edge runtime`);
  };
  return new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === "symbol" || key === "then" || key === "__esModule" ? undefined : fail,
    },
  );
}

export function createModules(options: ModulesOptions) {
  const files = new Map<string, FileContent>();
  const decoded = new Map<string, Uint8Array>();
  const directories = new Map<string, Set<string>>();
  const cache: Record<string, Module> = {};
  const mtime = options.mtime ?? new Date(0);
  const Buffer = options.globals?.Buffer as
    | {
        from(
          value: string | Uint8Array,
          encoding?: string,
        ): Uint8Array & { toString(encoding?: string): string };
      }
    | undefined;

  function addDirectory(path: string): void {
    while (path !== "/") {
      const parent = posix.dirname(path);
      let entries = directories.get(parent);
      if (entries?.has(posix.basename(path))) return;
      if (!entries) directories.set(parent, (entries = new Set()));
      entries.add(posix.basename(path));
      path = parent;
    }
  }

  function add(record: Readonly<Record<string, FileContent>>): void {
    for (const [path, content] of Object.entries(record)) {
      if (files.has(path)) continue;
      files.set(path, content);
      addDirectory(path);
    }
  }
  for (const link of Object.keys(options.links)) addDirectory(link);

  function absolute(path: string): string {
    return posix.resolve(options.process.cwd(), path);
  }

  function realpath(path: string): string {
    const segments = absolute(path).split("/").slice(1);
    let current = "";
    for (let index = 0, hops = 0; index < segments.length; index++) {
      current = `${current}/${segments[index]}`;
      const target = options.links[current];
      if (target !== undefined) {
        if (++hops > 40) throw fsError("ELOOP", "realpath", path);
        current = target;
      }
    }
    return current || "/";
  }

  const isFile = (path: string) => files.has(path);
  const isDirectory = (path: string) => directories.has(path);

  function bytes(path: string): Uint8Array {
    const content = files.get(path)!;
    if (typeof content === "string")
      return Buffer ? Buffer.from(content) : new TextEncoder().encode(content);
    let value = decoded.get(path);
    if (!value) {
      value = Buffer
        ? Buffer.from(content.base64, "base64")
        : Uint8Array.from(atob(content.base64), (c) => c.charCodeAt(0));
      decoded.set(path, value);
    }
    return value;
  }

  function text(path: string): string {
    const content = files.get(path)!;
    return typeof content === "string" ? content : new TextDecoder().decode(bytes(path));
  }

  // Module resolution, after Node's algorithm for require().

  function loadAsFile(path: string): string | undefined {
    for (const candidate of [path, `${path}.js`, `${path}.json`, `${path}.cjs`, `${path}.mjs`]) {
      const real = realpath(candidate);
      if (isFile(real)) return real;
    }
    return undefined;
  }

  function loadAsDirectory(path: string): string | undefined {
    const real = realpath(path);
    if (!isDirectory(real)) return undefined;
    const manifest = `${real}/package.json`;
    if (isFile(manifest)) {
      const main = (JSON.parse(text(manifest)) as { main?: string }).main;
      if (main) {
        const found = loadAsFile(posix.join(real, main)) ?? loadAsIndex(posix.join(real, main));
        if (found) return found;
      }
    }
    return loadAsIndex(real);
  }

  function loadAsIndex(path: string): string | undefined {
    for (const candidate of [`${path}/index.js`, `${path}/index.json`, `${path}/index.cjs`]) {
      const real = realpath(candidate);
      if (isFile(real)) return real;
    }
    return undefined;
  }

  const conditions = ["node", "require", "default"];

  function exportsTarget(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = exportsTarget(item);
        if (found) return found;
      }
      return undefined;
    }
    if (value && typeof value === "object") {
      for (const [key, target] of Object.entries(value))
        if (conditions.includes(key)) {
          const found = exportsTarget(target);
          if (found) return found;
        }
    }
    return undefined;
  }

  function resolveExports(exports: unknown, subpath: string): string | undefined {
    const map =
      typeof exports === "string" ||
      Array.isArray(exports) ||
      (exports &&
        typeof exports === "object" &&
        !Object.keys(exports).some((k) => k.startsWith(".")))
        ? { ".": exports }
        : (exports as Record<string, unknown>);
    if (subpath in map) return exportsTarget(map[subpath]);
    for (const [key, value] of Object.entries(map)) {
      const star = key.indexOf("*");
      if (star < 0) continue;
      const prefix = key.slice(0, star);
      const suffix = key.slice(star + 1);
      if (
        subpath.startsWith(prefix) &&
        subpath.endsWith(suffix) &&
        subpath.length >= key.length - 1
      ) {
        const target = exportsTarget(value);
        return target?.replaceAll(
          "*",
          subpath.slice(prefix.length, subpath.length - suffix.length),
        );
      }
    }
    return undefined;
  }

  function resolvePackage(id: string, from: string): string | undefined {
    const parts = id.split("/");
    const name = id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
    const subpath = id.slice(name.length);
    for (let directory = posix.dirname(from); ; directory = posix.dirname(directory)) {
      if (posix.basename(directory) !== "node_modules") {
        const packageDir = realpath(`${directory}/node_modules/${name}`);
        if (isDirectory(packageDir)) {
          const manifest = `${packageDir}/package.json`;
          const exports = isFile(manifest)
            ? (JSON.parse(text(manifest)) as { exports?: unknown }).exports
            : undefined;
          if (exports !== undefined) {
            const target = resolveExports(exports, `.${subpath}`);
            if (target) return loadAsFile(posix.join(packageDir, target));
          } else {
            const found = loadAsFile(packageDir + subpath) ?? loadAsDirectory(packageDir + subpath);
            if (found) return found;
          }
        }
      }
      if (directory === "/") return undefined;
    }
  }

  function builtinName(id: string): string | undefined {
    const name = id.startsWith("node:") ? id.slice(5) : id;
    if (
      id.startsWith("node:") ||
      shims[name] ||
      options.builtins[`node:${name}`] ||
      unavailable.has(name)
    )
      return name;
    return undefined;
  }

  function resolve(id: string, from: string): string {
    const builtin = builtinName(id);
    if (builtin !== undefined) return `node:${builtin}`;
    const found =
      id.startsWith("./") || id.startsWith("../") || id.startsWith("/") || id === "." || id === ".."
        ? (loadAsFile(posix.resolve(posix.dirname(from), id)) ??
          loadAsDirectory(posix.resolve(posix.dirname(from), id)))
        : resolvePackage(id, from);
    if (!found) throw notFound(id, from);
    return found;
  }

  const builtinModules = new Map<string, unknown>();
  function loadBuiltin(name: string): unknown {
    let value = builtinModules.get(name);
    if (value === undefined) {
      value = shims[name]?.() ?? options.builtins[`node:${name}`];
      if (value === undefined) value = unavailableBuiltin(name);
      builtinModules.set(name, value);
    }
    return value;
  }

  function makeRequire(from: string, parent?: Module): Require {
    const require = ((id: string) => {
      const filename = resolve(id, from);
      if (filename.startsWith("node:")) return loadBuiltin(filename.slice(5));
      return load(filename, parent).exports;
    }) as Require;
    require.resolve = (id: string) => resolve(id, from);
    require.cache = cache;
    return require;
  }

  function load(filename: string, parent?: Module): Module {
    const cached = cache[filename];
    if (cached) return cached;
    const module: Module = { id: filename, filename, exports: {}, loaded: false, children: [] };
    cache[filename] = module;
    parent?.children.push(module);
    try {
      if (filename.endsWith(".json")) module.exports = JSON.parse(text(filename));
      else {
        const source = text(filename).replace(/^#!.*/, "");
        const evaluate = new Function(...moduleParameters, `${source}\n//# sourceURL=${filename}`);
        evaluate.call(
          module.exports,
          module.exports,
          makeRequire(filename, module),
          module,
          filename,
          posix.dirname(filename),
          options.process,
          globalThis,
          options.globals?.Buffer,
          options.globals?.setImmediate,
          options.globals?.clearImmediate,
        );
      }
    } catch (error) {
      delete cache[filename];
      throw error;
    }
    module.loaded = true;
    return module;
  }

  // The builtins Next.js needs in a form the edge can provide.

  function stats(path: string) {
    const file = isFile(path);
    const size = file ? bytes(path).byteLength : 0;
    return {
      isFile: () => file,
      isDirectory: () => !file,
      isSymbolicLink: () => false,
      size,
      mtime,
      mtimeMs: mtime.getTime(),
      ctime: mtime,
      ctimeMs: mtime.getTime(),
      birthtime: mtime,
      birthtimeMs: mtime.getTime(),
      atime: mtime,
      atimeMs: mtime.getTime(),
      mode: file ? 0o100444 : 0o40555,
    };
  }

  function existing(path: string, syscall: string): string {
    const real = realpath(path);
    if (!isFile(real) && !isDirectory(real)) throw fsError("ENOENT", syscall, String(path));
    return real;
  }

  function encodingOf(options: unknown): string | undefined {
    return typeof options === "string"
      ? options
      : (options as { encoding?: string } | undefined)?.encoding;
  }

  function statSync(path: string, options?: { throwIfNoEntry?: boolean }) {
    try {
      return stats(existing(String(path), "stat"));
    } catch (error) {
      if (options?.throwIfNoEntry === false) return undefined;
      throw error;
    }
  }

  const fs = {
    constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
    existsSync: (path: string) => {
      try {
        existing(String(path), "access");
        return true;
      } catch {
        return false;
      }
    },
    readFileSync(path: string, options?: unknown) {
      const real = existing(String(path), "open");
      if (!isFile(real)) throw fsError("EISDIR", "read", String(path));
      return encodingOf(options) ? text(real) : bytes(real);
    },
    statSync,
    lstatSync: statSync,
    realpathSync: Object.assign((path: string) => existing(String(path), "realpath"), {
      native: (path: string) => existing(String(path), "realpath"),
    }),
    accessSync(path: string) {
      existing(String(path), "access");
    },
    readdirSync(path: string, options?: { withFileTypes?: boolean }) {
      const real = existing(String(path), "scandir");
      const entries = directories.get(real);
      if (!entries) throw fsError("ENOTDIR", "scandir", String(path));
      const names = [...entries];
      if (!options?.withFileTypes) return names;
      return names.map((name) => {
        const entry = stats(realpath(`${real}/${name}`));
        return {
          name,
          isFile: entry.isFile,
          isDirectory: entry.isDirectory,
          isSymbolicLink: () => false,
        };
      });
    },
  } as Record<string, unknown>;
  for (const name of [
    "writeFileSync",
    "appendFileSync",
    "mkdirSync",
    "rmSync",
    "unlinkSync",
    "renameSync",
    "copyFileSync",
    "mkdtempSync",
    "openSync",
  ])
    fs[name] = (path: string) => {
      throw fsError("EROFS", name.replace(/Sync$/, ""), String(path));
    };
  const promises: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fs)) {
    if (typeof value !== "function" || !name.endsWith("Sync") || name === "existsSync") continue;
    const method = name.slice(0, -4);
    promises[method] = async (...args: unknown[]) =>
      (value as (...a: unknown[]) => unknown)(...args);
    fs[method] = (...args: unknown[]) => {
      const callback = args.pop() as (error: unknown, value?: unknown) => void;
      let result: unknown;
      try {
        result = (value as (...a: unknown[]) => unknown)(...args);
      } catch (error) {
        queueMicrotask(() => callback(error));
        return;
      }
      queueMicrotask(() => callback(null, result));
    };
  }
  fs.promises = promises;

  const vm = {
    createContext: (context: object = {}) => context,
    isContext: () => true,
    runInNewContext(code: string, context: object = {}) {
      return new Function("globalThis", "self", "global", code)(context, context, context);
    },
    runInContext(code: string, context: object) {
      return vm.runInNewContext(code, context);
    },
    runInThisContext(code: string) {
      return (0, eval)(code);
    },
    Script: class {
      private readonly code: string;
      constructor(code: string) {
        this.code = code;
      }
      runInNewContext(context?: object) {
        return vm.runInNewContext(this.code, context);
      }
      runInContext(context: object) {
        return vm.runInNewContext(this.code, context);
      }
      runInThisContext() {
        return vm.runInThisContext(this.code);
      }
    },
  };

  const shims: Record<string, () => unknown> = {
    fs: () => fs,
    "fs/promises": () => promises,
    vm: () => vm,
    module: () => {
      function Module(this: { id: string; filename: string; exports: unknown }, id = "") {
        this.id = id;
        this.filename = id;
        this.exports = {};
      }
      Module.prototype.require = function (this: { filename?: string }, id: string) {
        return makeRequire(this.filename ?? `${options.process.cwd()}/index.js`)(id);
      };
      return Object.assign(Module, {
        Module,
        builtinModules: [
          ...Object.keys(options.builtins).map((k) => k.slice(5)),
          "fs",
          "vm",
          "module",
        ],
        isBuiltin: (id: string) => builtinName(id) !== undefined,
        createRequire: (filename: string | URL) =>
          makeRequire(String(filename).replace(/^file:\/\//, "")),
        findSourceMap: () => undefined,
        _resolveFilename: (id: string, parent?: { filename?: string }) =>
          resolve(id, parent?.filename ?? `${options.process.cwd()}/index.js`),
        _cache: cache,
        _extensions: {},
      });
    },
  };

  return {
    /** Adds files; a path already present keeps its content. */
    add,
    /** Requires a module by absolute path or bare specifier, as from the working directory. */
    require: (id: string) => makeRequire(`${options.process.cwd()}/index.js`)(id),
    has: (path: string) => isFile(realpath(path)),
    /** A file's content as text. */
    read: (path: string) => text(realpath(path)),
    /** A file's content as bytes. */
    bytes: (path: string) => bytes(realpath(path)),
  };
}
