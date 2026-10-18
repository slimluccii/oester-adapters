export function generateStaticParams() {
  return [{ id: "1" }, { id: "2" }];
}

export default async function Post({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <h1>Exported post {id}</h1>;
}
