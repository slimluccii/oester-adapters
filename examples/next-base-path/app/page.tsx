import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Docs home</h1>
      <Link href="/about">about</Link>
    </main>
  );
}
