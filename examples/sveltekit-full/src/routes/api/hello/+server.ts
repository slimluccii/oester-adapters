export function GET({ request }) {
  return Response.json({ message: "hello", via: request.headers.get("x-via") });
}

export async function POST({ request }) {
  return Response.json({ received: await request.json() }, { status: 201 });
}
