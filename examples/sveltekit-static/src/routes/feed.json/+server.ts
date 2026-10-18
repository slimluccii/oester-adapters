export const prerender = true;

export function GET() {
  return Response.json({ posts: ["hello-world", "second-post"] });
}
