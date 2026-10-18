import { headers } from "next/headers";

export const runtime = "edge";

export default async function Edge() {
  const agent = (await headers()).get("user-agent");
  return (
    <main>
      <p id="edge">rendered on the edge runtime for {agent}</p>
      <p id="edge-greeting">greeting: {process.env.GREETING}</p>
    </main>
  );
}
