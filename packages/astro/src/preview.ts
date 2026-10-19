import { fileURLToPath } from "node:url";
import type { CreatePreviewServer } from "astro";
import { startPreview } from "@oester/build-output/preview";

/** `astro preview`: serves `.oester/output` the way Oester serves a deployment of it. */
const createPreviewServer: CreatePreviewServer = async ({ root, host, port, headers, logger }) => {
  const preview = await startPreview({
    root: fileURLToPath(root),
    port,
    ...(host ? { host } : {}),
    ...(headers ? { headers } : {}),
    logger,
  });
  logger.info(`Serving .oester/output at ${preview.url}`);
  return preview;
};

export default createPreviewServer;
