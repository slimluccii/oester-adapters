import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";

async function stamp() {
  "use cache";
  cacheLife("hours");
  cacheTag("stamp");
  return Date.now();
}

async function Stamps() {
  await connection();
  return (
    <>
      <p id="cached">cached {await stamp()}</p>
      <p id="fresh">fresh {Date.now()}</p>
    </>
  );
}

export default function Cached() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Stamps />
    </Suspense>
  );
}
