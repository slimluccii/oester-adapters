import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("content-type", "text/plain");
  res.write("one\n");
  await new Promise((resolve) => setTimeout(resolve, 300));
  res.end("two\n");
}
