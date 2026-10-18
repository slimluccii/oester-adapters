import { Suspense } from "react";
import { connection } from "next/server";

async function Slow() {
  await connection();
  await new Promise((resolve) => setTimeout(resolve, 600));
  return <p id="slow">slow content arrived</p>;
}

export default function Streaming() {
  return (
    <main>
      <h1>Streaming</h1>
      <Suspense fallback={<p>loading slow content</p>}>
        <Slow />
      </Suspense>
    </main>
  );
}
