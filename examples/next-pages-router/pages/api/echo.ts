import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    res.status(201).json({ received: req.body, type: req.headers["content-type"] });
    return;
  }
  res.setHeader("cache-control", "public, max-age=30");
  res.status(200).json({ method: req.method, query: req.query, cookies: req.cookies });
}
