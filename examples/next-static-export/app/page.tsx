import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main>
      <h1>Exported home</h1>
      <Image src="/pearl.svg" alt="" width={8} height={8} />
      <Link href="/about">about</Link>
    </main>
  );
}
