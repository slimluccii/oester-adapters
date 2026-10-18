import { cookies } from "next/headers";

export async function GET() {
  (await cookies()).set("flavor", "vanilla", { path: "/", httpOnly: true });
  return Response.json({ set: true });
}
