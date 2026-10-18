import { Suspense } from "react";
import { cookies } from "next/headers";

async function Visitor() {
  const name = (await cookies()).get("name")?.value ?? "stranger";
  await new Promise((resolve) => setTimeout(resolve, 300));
  return <p id="visitor">hello {name}</p>;
}

export default function Ppr() {
  return (
    <main>
      <h1>static shell</h1>
      <Suspense fallback={<p>loading visitor</p>}>
        <Visitor />
      </Suspense>
    </main>
  );
}
