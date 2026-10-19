import { after } from "next/server";

let ranAfter = 0;

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("read")) return Response.json({ ranAfter });
  after(() => {
    ranAfter = Date.now();
  });
  return Response.json({ scheduled: true });
}
