import * as assert from "node:assert";
import * as assertStrict from "node:assert/strict";
import * as asyncHooks from "node:async_hooks";
import * as buffer from "node:buffer";
import * as console from "node:console";
import * as crypto from "node:crypto";
import * as diagnosticsChannel from "node:diagnostics_channel";
import * as events from "node:events";
import * as path from "node:path";
import * as pathPosix from "node:path/posix";
import * as perfHooks from "node:perf_hooks";
import process from "node:process";
import * as querystring from "node:querystring";
import * as stream from "node:stream";
import * as streamConsumers from "node:stream/consumers";
import * as streamPromises from "node:stream/promises";
import * as streamWeb from "node:stream/web";
import * as stringDecoder from "node:string_decoder";
import * as timers from "node:timers";
import * as timersPromises from "node:timers/promises";
import * as url from "node:url";
import * as util from "node:util";
import * as utilTypes from "node:util/types";
import * as zlib from "node:zlib";

// What require() of a builtin returns in Node is the module's default export, which also carries its named exports.
const cjs = (namespace: object) =>
  ("default" in namespace ? namespace.default : namespace) as object;

/** The Node builtins Oester's edge provides, as the modules require() returns. */
export const builtins: Readonly<Record<string, object>> = {
  "node:assert": cjs(assert),
  "node:assert/strict": cjs(assertStrict),
  "node:async_hooks": cjs(asyncHooks),
  "node:buffer": cjs(buffer),
  "node:console": cjs(console),
  "node:crypto": cjs(crypto),
  "node:diagnostics_channel": cjs(diagnosticsChannel),
  "node:events": cjs(events),
  "node:path": cjs(path),
  "node:path/posix": cjs(pathPosix),
  "node:perf_hooks": cjs(perfHooks),
  "node:process": process,
  "node:querystring": cjs(querystring),
  "node:stream": cjs(stream),
  "node:stream/consumers": cjs(streamConsumers),
  "node:stream/promises": cjs(streamPromises),
  "node:stream/web": cjs(streamWeb),
  "node:string_decoder": cjs(stringDecoder),
  "node:timers": cjs(timers),
  "node:timers/promises": cjs(timersPromises),
  "node:url": cjs(url),
  "node:util": cjs(util),
  "node:util/types": cjs(utilTypes),
  "node:zlib": cjs(zlib),
};
