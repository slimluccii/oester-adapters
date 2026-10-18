import { revalidatePath } from "next/cache";

export async function POST() {
  revalidatePath("/cached-page");
  return Response.json({ revalidated: true });
}
