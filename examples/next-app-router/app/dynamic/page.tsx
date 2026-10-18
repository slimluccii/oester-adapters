import { cookies, headers } from "next/headers";

export default async function Dynamic() {
  const requestHeaders = await headers();
  const flavor = (await cookies()).get("flavor")?.value ?? "none";
  return (
    <main>
      <p id="agent">agent: {requestHeaders.get("user-agent")}</p>
      <p id="proxy">from proxy: {requestHeaders.get("x-from-proxy") ?? "nothing"}</p>
      <p id="flavor">flavor: {flavor}</p>
      <p id="greeting">greeting: {process.env.GREETING}</p>
    </main>
  );
}
