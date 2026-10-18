import Link from "next/link";
import { Counter } from "./counter";

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <Counter />
      <Link href="/dynamic">dynamic</Link>
    </main>
  );
}
