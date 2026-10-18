import { createHash } from "node:crypto";

export default defineEventHandler(() => createHash("sha256").update("oester").digest("hex"));
