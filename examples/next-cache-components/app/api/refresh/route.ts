import { revalidateTag } from "next/cache";

export async function POST() {
  revalidateTag("stamp", { expire: 0 });
  return Response.json({ refreshed: true });
}
