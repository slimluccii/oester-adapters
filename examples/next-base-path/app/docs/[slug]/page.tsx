export function generateStaticParams() {
  return [{ slug: "intro" }];
}

export default async function Doc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <h1>Doc {slug}</h1>;
}
