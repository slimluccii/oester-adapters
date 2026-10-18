export async function GET() {
  return Response.json({ greeting: process.env.GREETING, time: Date.now() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name: string };
  return Response.json({ hello: body.name }, { status: 201 });
}
