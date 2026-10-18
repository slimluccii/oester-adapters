import { fileURLToPath } from "node:url";
import { adapter } from "./adapter.ts";

/** The value for `adapterPath` in next.config: this module, whose default export is the adapter. */
export const adapterPath = fileURLToPath(import.meta.url);

export default adapter;
