export async function load({ fetch }) {
  const hello = await fetch("/api/hello").then((r) => r.json());
  return { hello };
}
